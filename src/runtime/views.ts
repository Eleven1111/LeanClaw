import { getDb } from './db'
import { USER_STATUS_MAP } from '../shared/machine'
import { parseRefineInstructions } from '../shared/verify'
import type { InternalStatus, RunDetailView, TaskView } from '../shared/types'
import { publish } from './bus'
import { getQueuePosition } from './scheduler'

export function buildTaskView(taskId: string): TaskView {
  const db = getDb()
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as
    | {
        id: string
        goal: string
        brief: string | null
        input_path: string
        recipe_id: string
        project_id: string | null
        status: InternalStatus
        budget_usd: number | null
        refine_instructions: string | null
        created_at: string
        updated_at: string
      }
    | undefined
  if (!t) throw new Error('任务不存在: ' + taskId)
  const project = t.project_id
    ? db.prepare('SELECT name FROM projects WHERE id = ?').get(t.project_id) as { name: string } | undefined
    : undefined
  const run = db
    .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(taskId) as
    | { id: string; started_at: string | null; ended_at: string | null }
    | undefined
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const steps = run
    ? (db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY idx').all(run.id) as any[])
    : []
  const approvals = db
    .prepare('SELECT * FROM approvals WHERE task_id = ? ORDER BY requested_at')
    .all(taskId) as any[]
  const andons = db
    .prepare('SELECT * FROM andon_events WHERE task_id = ? ORDER BY created_at')
    .all(taskId) as any[]
  const artifacts = db
    .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at')
    .all(taskId) as any[]
  const verifications = run
    ? (db
        .prepare('SELECT * FROM verifications WHERE run_id = ? ORDER BY created_at')
        .all(run.id) as any[])
    : []
  const evidence = db
    .prepare('SELECT * FROM evidence WHERE task_id = ? ORDER BY created_at')
    .all(taskId) as any[]
  const mc = run
    ? (db
        .prepare(
          `SELECT COUNT(*) c, COALESCE(SUM(tokens_in),0) ti, COALESCE(SUM(tokens_out),0) tou,
                  COALESCE(SUM(cost_usd),0) cost
           FROM model_calls m JOIN steps s ON m.step_id = s.id WHERE s.run_id = ?`
        )
        .get(run.id) as any)
    : { c: 0, ti: 0, tou: 0, cost: 0 }
  const tc = run
    ? (db
        .prepare(
          'SELECT COUNT(*) c FROM tool_calls t JOIN steps s ON t.step_id = s.id WHERE s.run_id = ?'
        )
        .get(run.id) as any)
    : { c: 0 }
  const ev = db.prepare('SELECT COUNT(*) c FROM run_events WHERE task_id = ?').get(taskId) as any
  const retries = steps.reduce((n, s) => n + Math.max(0, (s.attempt ?? 0) - 1), 0)
  const interventions =
    approvals.filter((a) => a.status !== 'pending').length +
    andons.filter((a) => a.status === 'resolved').length
  const durationMs = run?.started_at
    ? new Date(run.ended_at ?? new Date().toISOString()).getTime() -
      new Date(run.started_at).getTime()
    : 0

  return {
    id: t.id,
    goal: t.goal,
    brief: t.brief,
    inputPath: t.input_path,
    status: t.status,
    userStatus: USER_STATUS_MAP[t.status],
    recipeId: t.recipe_id,
    projectId: t.project_id ?? null,
    projectName: project?.name ?? null,
    budgetUsd: t.budget_usd ?? null,
    refineInstructions: parseRefineInstructions(t.refine_instructions),
    queuePosition: getQueuePosition(t.id),
    steps: steps.map((s) => ({
      id: s.id,
      idx: s.idx,
      name: s.name,
      title: s.title,
      kind: s.kind,
      status: s.status,
      attempt: s.attempt,
      outputSummary: s.output_summary
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      stepId: a.step_id,
      actionDesc: a.action_desc,
      diff: a.diff,
      status: a.status
    })),
    andons: andons.map((a) => ({
      id: a.id,
      stepId: a.step_id,
      reason: a.reason,
      impact: a.impact,
      recommendedActions: JSON.parse(a.recommended_actions) as string[],
      status: a.status
    })),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      version: a.version,
      contentPreview: String(a.content ?? '').slice(0, 4000),
      localPath: a.local_path,
      origin: a.origin ?? null,
      isDeliverable: Boolean(a.is_deliverable),
      verificationStatus: a.verification_status,
      createdAt: a.created_at
    })),
    verifications: verifications.map((v) => ({
      id: v.id,
      stepId: v.step_id,
      kind: v.kind,
      status: v.status,
      detail: v.detail
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      sourceType: e.source_type,
      locator: e.locator,
      excerpt: e.excerpt,
      verificationStatus: e.verification_status
    })),
    metrics: {
      durationMs,
      modelCalls: mc.c,
      toolCalls: tc.c,
      retries,
      interventions,
      tokensIn: mc.ti,
      tokensOut: mc.tou,
      costUsd: mc.cost,
      eventCount: ev.c
    },
    createdAt: t.created_at,
    updatedAt: t.updated_at
  }
}

export function listTaskViews(): TaskView[] {
  const ids = getDb()
    .prepare('SELECT id FROM tasks ORDER BY created_at DESC')
    .all() as { id: string }[]
  return ids.map((r) => buildTaskView(r.id))
}

export function publishTask(taskId: string): void {
  publish({ type: 'task', task: buildTaskView(taskId) })
}

export function buildRunDetail(taskId: string): RunDetailView {
  const db = getDb()
  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string }
    | undefined
  if (!task) throw new Error('任务不存在: ' + taskId)
  const run = db
    .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(taskId) as
    | {
        id: string
        recipe_id: string
        status: string
        started_at: string | null
        ended_at: string | null
        current_step_index: number
      }
    | undefined
  if (!run) throw new Error('该任务尚无 Run: ' + taskId)

  const steps = db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY idx').all(run.id) as {
    id: string
    idx: number
    name: string
    title: string
    kind: string
    status: string
    attempt: number
    output_summary: string | null
    started_at: string | null
    ended_at: string | null
  }[]
  const stepIds = steps.map((s) => s.id)
  const placeholders = stepIds.map(() => '?').join(',')

  const toolCalls = stepIds.length
    ? (db
        .prepare(
          `SELECT * FROM tool_calls WHERE step_id IN (${placeholders}) ORDER BY started_at`
        )
        .all(...stepIds) as {
        id: string
        step_id: string
        tool_id: string
        tool_version: string
        status: string
        risk_level: string
        retry_count: number
        output_summary: string | null
        error: string | null
        started_at: string
        ended_at: string | null
      }[])
    : []
  const modelCalls = stepIds.length
    ? (db
        .prepare(
          `SELECT * FROM model_calls WHERE step_id IN (${placeholders}) ORDER BY created_at`
        )
        .all(...stepIds) as {
        id: string
        step_id: string
        model: string
        tokens_in: number | null
        tokens_out: number | null
        cost_usd: number | null
        status: string
        error: string | null
        created_at: string
      }[])
    : []
  const verifications = db
    .prepare('SELECT * FROM verifications WHERE run_id = ? ORDER BY created_at')
    .all(run.id) as {
    id: string
    step_id: string
    kind: string
    status: string
    detail: string
  }[]
  const events = db
    .prepare('SELECT * FROM run_events WHERE task_id = ? ORDER BY seq')
    .all(taskId) as {
    seq: number
    type: string
    step_id: string | null
    payload: string | null
    created_at: string
  }[]

  const toolCallsByStep = new Map<string, typeof toolCalls>()
  const modelCallsByStep = new Map<string, typeof modelCalls>()
  const verificationsByStep = new Map<string, typeof verifications>()
  for (const s of steps) {
    toolCallsByStep.set(s.id, [])
    modelCallsByStep.set(s.id, [])
    verificationsByStep.set(s.id, [])
  }
  for (const tc of toolCalls) toolCallsByStep.get(tc.step_id)?.push(tc)
  for (const mc of modelCalls) modelCallsByStep.get(mc.step_id)?.push(mc)
  for (const v of verifications) verificationsByStep.get(v.step_id)?.push(v)

  return {
    runId: run.id,
    taskId,
    recipeId: run.recipe_id,
    status: run.status,
    startedAt: run.started_at,
    endedAt: run.ended_at,
    currentStepIndex: run.current_step_index,
    steps: steps.map((s) => ({
      id: s.id,
      idx: s.idx,
      name: s.name,
      title: s.title,
      kind: s.kind as RunDetailView['steps'][number]['kind'],
      status: s.status as RunDetailView['steps'][number]['status'],
      attempt: s.attempt,
      outputSummary: s.output_summary,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      toolCalls: (toolCallsByStep.get(s.id) ?? []).map((tc) => ({
        id: tc.id,
        toolId: tc.tool_id,
        toolVersion: tc.tool_version,
        status: tc.status,
        riskLevel: tc.risk_level as RunDetailView['steps'][number]['toolCalls'][number]['riskLevel'],
        retryCount: tc.retry_count,
        outputSummary: tc.output_summary,
        error: tc.error,
        startedAt: tc.started_at,
        endedAt: tc.ended_at
      })),
      modelCalls: (modelCallsByStep.get(s.id) ?? []).map((mc) => ({
        id: mc.id,
        model: mc.model,
        tokensIn: mc.tokens_in,
        tokensOut: mc.tokens_out,
        costUsd: mc.cost_usd,
        status: mc.status,
        error: mc.error,
        createdAt: mc.created_at
      })),
      verifications: (verificationsByStep.get(s.id) ?? []).map((v) => ({
        id: v.id,
        kind: v.kind as RunDetailView['steps'][number]['verifications'][number]['kind'],
        status: v.status as RunDetailView['steps'][number]['verifications'][number]['status'],
        detail: v.detail
      }))
    })),
    events: events.map((e) => ({
      seq: e.seq,
      type: e.type,
      stepId: e.step_id,
      payload: e.payload,
      createdAt: e.created_at
    }))
  }
}
