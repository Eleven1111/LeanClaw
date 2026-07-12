import { createHash } from 'crypto'
import { dirname } from 'path'
import { getDb, getWorkspaceDir, now, uid } from './db'
import { appendEvent } from './ledger'
import { getStatus, transition, tryTransition } from './state'
import { publishTask } from './views'
import { getTool, ToolError, type ToolContext } from './tools'
import { callModel } from './model'
import { getRecipe, type StepContext } from './recipe'
import { requestRun } from './scheduler'
import { parseRefineInstructions } from '../shared/verify'
import { applyProjectInstructions } from '../shared/project'
import type { ModelTier } from '../shared/types'

const MAX_ATTEMPTS = 3

const active = new Set<string>()
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class Suspend extends Error {
  constructor() {
    super('step suspended')
  }
}

interface TaskRow {
  id: string
  goal: string
  input_path: string
  recipe_id: string
  status: string
  refine_instructions?: string | null
  project_instructions_snapshot?: string | null
}

export interface RunRow {
  id: string
  task_id: string
  recipe_id: string
  status: string
  current_step_index: number
  resume_step_index: number | null
}

interface StepRow {
  id: string
  run_id: string
  idx: number
  name: string
  kind: string
  status: string
  attempt: number
}

export function getActiveRun(taskId: string): RunRow | undefined {
  return getDb()
    .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(taskId) as RunRow | undefined
}

const RETRY_LIMIT = 2

export function openAndon(
  taskId: string,
  runId: string,
  stepId: string | null,
  reason: string,
  impact: string,
  actions: string[],
  resumeStepIndex: number
): void {
  const db = getDb()
  let finalReason = reason
  let finalActions = actions
  if (stepId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) c FROM andon_events
         WHERE run_id = ? AND step_id = ? AND status = 'resolved' AND chosen_action = 'retry'`
      )
      .get(runId, stepId) as { c: number }
    if (row.c >= RETRY_LIMIT) {
      finalActions = ['cancel']
      finalReason = `${reason}（该步骤已重试停线 ${row.c} 次，建议取消任务或修改 Brief 重新规划）`
    }
  }
  db.prepare(
    `INSERT INTO andon_events
     (id, task_id, run_id, step_id, reason, impact, recommended_actions, resume_step_index, status, created_at)
     VALUES (?,?,?,?,?,?,?,?, 'open', ?)`
  ).run(uid(), taskId, runId, stepId, finalReason, impact, JSON.stringify(finalActions), resumeStepIndex, now())
  appendEvent(taskId, 'andon-opened', { reason: finalReason }, runId, stepId)
  transition(taskId, 'andon_open')
}

export async function drive(taskId: string): Promise<void> {
  if (active.has(taskId)) return
  active.add(taskId)
  try {
    await loop(taskId)
  } finally {
    active.delete(taskId)
    if (getStatus(taskId) === 'queued') {
      setImmediate(() => {
        requestRun(taskId)
      })
    }
  }
}

async function loop(taskId: string): Promise<void> {
  while (true) {
    if (getStatus(taskId) !== 'queued') return
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow
    const run = getActiveRun(taskId)
    if (!run) return
    const recipe = getRecipe(run.recipe_id)
    const tpl = recipe.steps[run.current_step_index]
    if (!tpl) return
    const step = getDb()
      .prepare('SELECT * FROM steps WHERE run_id = ? AND idx = ?')
      .get(run.id, run.current_step_index) as StepRow
    transition(taskId, tpl.kind === 'verify' || tpl.kind === 'deliver' ? 'verifying' : 'step_running')
    getDb()
      .prepare(`UPDATE steps SET status = 'running', started_at = COALESCE(started_at, ?) WHERE id = ?`)
      .run(now(), step.id)
    appendEvent(taskId, 'step-started', { name: tpl.name, idx: run.current_step_index }, run.id, step.id)
    publishTask(taskId)
    const ctx = makeCtx(task, run, step, tpl)
    try {
      const summary = await tpl.run(ctx)
      getDb()
        .prepare(`UPDATE steps SET status = 'done', output_summary = ?, ended_at = ? WHERE id = ?`)
        .run(summary, now(), step.id)
      getDb()
        .prepare('UPDATE runs SET current_step_index = ? WHERE id = ?')
        .run(run.current_step_index + 1, run.id)
      appendEvent(taskId, 'step-completed', { name: tpl.name, summary }, run.id, step.id)
      if (getStatus(taskId) === 'delivered') {
        publishTask(taskId)
        return
      }
      tryTransition(taskId, 'queued')
      publishTask(taskId)
    } catch (e) {
      if (e instanceof Suspend) {
        publishTask(taskId)
        return
      }
      const message = (e as Error).message
      const retryable = !(e instanceof ToolError) || e.retryable
      const attempt = step.attempt + 1
      getDb().prepare('UPDATE steps SET attempt = ? WHERE id = ?').run(attempt, step.id)
      appendEvent(
        taskId,
        'step-error',
        { name: tpl.name, attempt, message, retryable },
        run.id,
        step.id
      )
      if (retryable && attempt < MAX_ATTEMPTS) {
        transition(taskId, 'step_retrying')
        publishTask(taskId)
        await sleep(400 * attempt)
        if (getStatus(taskId) !== 'step_retrying') return
        transition(taskId, 'queued')
        continue
      }
      getDb().prepare(`UPDATE steps SET status = 'failed', ended_at = ? WHERE id = ?`).run(now(), step.id)
      openAndon(
        taskId,
        run.id,
        step.id,
        retryable
          ? `步骤「${tpl.title}」连续 ${attempt} 次失败：${message}`
          : `步骤「${tpl.title}」失败：${message}`,
        '任务已停线；此前步骤的产物仍然有效，可从当前步骤恢复。',
        ['retry', 'cancel'],
        run.current_step_index
      )
      return
    }
  }
}

function getTaskCost(db: ReturnType<typeof getDb>, taskId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(m.cost_usd),0) cost FROM model_calls m
       JOIN steps s ON m.step_id = s.id JOIN runs r ON s.run_id = r.id
       WHERE r.task_id = ?`
    )
    .get(taskId) as { cost: number }
  return row.cost
}

function makeCtx(task: TaskRow, run: RunRow, step: StepRow, tpl: { tier?: ModelTier }): StepContext {
  const toolCtx: ToolContext = {
    allowedDirs: task.input_path ? [getWorkspaceDir(), dirname(task.input_path)] : [getWorkspaceDir()]
  }
  const db = getDb()

  return {
    taskId: task.id,
    runId: run.id,
    stepId: step.id,
    stepIdx: run.current_step_index,
    goal: task.goal,
    inputPath: task.input_path,
    refineInstructions: parseRefineInstructions(task.refine_instructions ?? null),

    async callTool(toolId, input) {
      const tool = getTool(toolId)
      const risk = tool.riskFor(input, toolCtx)
      if (risk === 'forbidden') {
        appendEvent(task.id, 'tool-forbidden', { toolId, input: sanitize(input) }, run.id, step.id)
        openAndon(
          task.id,
          run.id,
          step.id,
          `策略禁止执行「${tool.name}」：目标路径不在允许目录内`,
          '该动作未被执行，任务已停线。',
          ['cancel'],
          run.current_step_index
        )
        throw new Suspend()
      }
      let approvalId: string | null = null
      if (risk === 'approval_required') {
        const appr = db
          .prepare(
            `SELECT * FROM approvals WHERE step_id = ? AND status != 'superseded'
             ORDER BY requested_at DESC LIMIT 1`
          )
          .get(step.id) as { id: string; status: string } | undefined
        if (!appr) {
          const dry = tool.dryRun
            ? tool.dryRun(input)
            : { summary: '', data: { diff: '(该工具不支持 Dry Run)' } }
          const id = uid()
          db.prepare(
            `INSERT INTO approvals (id, task_id, run_id, step_id, action_desc, diff, status, requested_at)
             VALUES (?,?,?,?,?,?, 'pending', ?)`
          ).run(
            id,
            task.id,
            run.id,
            step.id,
            `${tool.name}: ${String(input.path ?? toolId)}`,
            String(dry.data?.diff ?? ''),
            now()
          )
          appendEvent(task.id, 'approval-requested', { toolId }, run.id, step.id)
          transition(task.id, 'awaiting_approval')
          throw new Suspend()
        }
        if (appr.status !== 'approved') throw new Suspend()
        approvalId = appr.id
      }
      const tcId = uid()
      db.prepare(
        `INSERT INTO tool_calls
         (id, step_id, tool_id, tool_version, input_json, status, risk_level, approval_id, retry_count, started_at)
         VALUES (?,?,?,?,?, 'running', ?, ?, ?, ?)`
      ).run(tcId, step.id, tool.id, tool.version, JSON.stringify(sanitize(input)), risk, approvalId, step.attempt, now())
      try {
        const res = await tool.execute(input, toolCtx)
        db.prepare(`UPDATE tool_calls SET status = 'ok', output_summary = ?, ended_at = ? WHERE id = ?`).run(
          res.summary,
          now(),
          tcId
        )
        appendEvent(task.id, 'tool-call', { toolId, summary: res.summary }, run.id, step.id)
        return res
      } catch (e) {
        db.prepare(`UPDATE tool_calls SET status = 'error', error = ?, ended_at = ? WHERE id = ?`).run(
          (e as Error).message,
          now(),
          tcId
        )
        throw e
      }
    },

    async callModel(prompt) {
      const budgetRow = db.prepare('SELECT budget_usd FROM tasks WHERE id = ?').get(task.id) as {
        budget_usd: number | null
      }
      const budget = budgetRow.budget_usd
      const hasBudget = budget !== null && budget > 0
      let before = 0
      if (hasBudget) {
        before = getTaskCost(db, task.id)
        if (before >= (budget as number)) {
          appendEvent(task.id, 'budget-exhausted', { before, budget }, run.id, step.id)
          openAndon(
            task.id,
            run.id,
            step.id,
            `预算已用尽（$${before.toFixed(4)}/$${(budget as number).toFixed(2)}）`,
            '此前步骤的产物仍然有效；可追加预算后重试当前步骤。',
            ['retry', 'cancel'],
            run.current_step_index
          )
          throw new Suspend()
        }
      }
      const r = await callModel(
        step.id,
        applyProjectInstructions(prompt, task.project_instructions_snapshot),
        tpl.tier
      )
      if (r.fallback) {
        appendEvent(task.id, 'model-fallback', r.fallback, run.id, step.id)
      }
      appendEvent(task.id, 'model-call', { model: r.model, tokensOut: r.tokensOut }, run.id, step.id)
      if (hasBudget) {
        const b = budget as number
        const after = before + r.costUsd
        if (before < b * 0.8 && after >= b * 0.8) {
          appendEvent(task.id, 'budget-warning', { after, budget: b }, run.id, step.id)
          publishTask(task.id)
        }
      }
      return r.text
    },

    saveArtifact(a) {
      const prev = db
        .prepare(
          `SELECT id, version FROM artifacts
           WHERE task_id = ? AND type = ? AND superseded_by IS NULL
           ORDER BY version DESC LIMIT 1`
        )
        .get(task.id, a.type) as { id: string; version: number } | undefined
      const id = uid()
      const version = prev ? prev.version + 1 : 1
      db.prepare(
        `INSERT INTO artifacts
         (id, task_id, run_id, step_id, type, title, version, content, local_path, mime_type,
          producer, source_artifact_ids, hash, origin, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        id,
        task.id,
        run.id,
        step.id,
        a.type,
        a.title,
        version,
        a.content ?? null,
        a.localPath ?? null,
        a.mimeType ?? 'text/markdown',
        a.producer ?? 'runtime',
        JSON.stringify(a.sourceArtifactIds ?? []),
        a.content ? createHash('sha256').update(a.content).digest('hex') : null,
        a.origin ?? null,
        now()
      )
      if (prev) db.prepare('UPDATE artifacts SET superseded_by = ? WHERE id = ?').run(id, prev.id)
      appendEvent(task.id, 'artifact-created', { type: a.type, title: a.title, version }, run.id, step.id)
      return id
    },

    getArtifact(type) {
      const row = db
        .prepare(
          `SELECT id, content, local_path, origin, title FROM artifacts
           WHERE task_id = ? AND type = ? AND superseded_by IS NULL
           ORDER BY version DESC LIMIT 1`
        )
        .get(task.id, type) as
        | {
            id: string
            content: string | null
            local_path: string | null
            origin: string | null
            title: string
          }
        | undefined
      if (!row) throw new ToolError(`缺少必需 Artifact: ${type}`, false)
      return row
    },

    getArtifacts(typePrefix) {
      const rows = db
        .prepare(
          `SELECT id, type, content, local_path, origin, title FROM artifacts
           WHERE task_id = ? AND type LIKE ? AND superseded_by IS NULL
           ORDER BY type ASC`
        )
        .all(task.id, `${typePrefix}%`) as {
        id: string
        type: string
        content: string | null
        local_path: string | null
        origin: string | null
        title: string
      }[]
      return rows
    },

    addEvidence(e) {
      db.prepare(
        `INSERT INTO evidence (id, task_id, artifact_id, source_type, locator, excerpt, verification_status, created_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(uid(), task.id, e.artifactId, e.sourceType, e.locator, e.excerpt, e.verificationStatus, now())
    },

    addVerification(kind, status, detail, artifactId) {
      db.prepare(
        `INSERT INTO verifications (id, run_id, step_id, artifact_id, kind, status, detail, created_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(uid(), run.id, step.id, artifactId ?? null, kind, status, detail, now())
      if (artifactId) {
        db.prepare('UPDATE artifacts SET verification_status = ? WHERE id = ?').run(
          status === 'passed' ? 'verified' : 'failed',
          artifactId
        )
      }
      appendEvent(task.id, 'verification', { kind, status, detail }, run.id, step.id)
    },

    failVerification(detail, resumeStepIndex): never {
      db.prepare('UPDATE runs SET resume_step_index = ? WHERE id = ?').run(resumeStepIndex, run.id)
      db.prepare(`UPDATE steps SET status = 'failed', ended_at = ? WHERE id = ?`).run(now(), step.id)
      appendEvent(task.id, 'verification-blocked', { detail, resumeStepIndex }, run.id, step.id)
      transition(task.id, 'verification_failed')
      throw new Suspend()
    },

    markDelivered(artifactId) {
      db.prepare('UPDATE artifacts SET is_deliverable = 1 WHERE id = ?').run(artifactId)
      db.prepare(`UPDATE runs SET status = 'done', ended_at = ? WHERE id = ?`).run(now(), run.id)
      appendEvent(task.id, 'delivered', { artifactId }, run.id, step.id)
      transition(task.id, 'delivered')
    },

    countOpenBlockers() {
      const a = db
        .prepare(`SELECT COUNT(*) c FROM andon_events WHERE task_id = ? AND status = 'open'`)
        .get(task.id) as { c: number }
      const p = db
        .prepare(`SELECT COUNT(*) c FROM approvals WHERE task_id = ? AND status = 'pending'`)
        .get(task.id) as { c: number }
      return a.c + p.c
    }
  }
}

function sanitize(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === 'string' && v.length > 400 ? v.slice(0, 400) + `…(${v.length} chars)` : v
  }
  return out
}
