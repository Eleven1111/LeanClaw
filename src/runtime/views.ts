import { getDb } from './db'
import { USER_STATUS_MAP } from '../shared/machine'
import { parseRefineInstructions } from '../shared/verify'
import type {
  InternalStatus,
  RunDetailView,
  TaskSummaryDeliverable,
  TaskSummaryView,
  TaskView
} from '../shared/types'
import { buildTaskSummary } from '../shared/task-summary'
import { publish } from './bus'
import { getQueuePosition } from './scheduler'
import { medianDurationMs } from '../shared/progress'
import {
  projectSafeRunEventPayload,
  redactTaskPrivatePaths
} from '../shared/privacy'
import { queryRecipeStepDurations } from './step-durations'

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
        agent_id: string | null
        agent_name_snapshot: string | null
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
  const durationsByStep = queryRecipeStepDurations(t.recipe_id)
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
  const ev = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM run_events WHERE task_id = ? AND type != 'events-archived') +
       (SELECT COUNT(*) FROM run_events_archive WHERE task_id = ?) c`
  ).get(taskId, taskId) as any
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
    brief: redactTaskPrivatePaths(t.brief, t.input_path),
    inputPath: t.input_path,
    status: t.status,
    userStatus: USER_STATUS_MAP[t.status],
    recipeId: t.recipe_id,
    projectId: t.project_id ?? null,
    projectName: project?.name ?? null,
    agentId: t.agent_id ?? null,
    agentName: t.agent_name_snapshot ?? null,
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
      outputSummary: redactTaskPrivatePaths(s.output_summary, t.input_path),
      estimatedDurationMs: medianDurationMs(durationsByStep.get(s.idx) ?? [])
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      stepId: a.step_id,
      actionDesc: redactTaskPrivatePaths(a.action_desc, t.input_path),
      diff: redactTaskPrivatePaths(a.diff, t.input_path),
      status: a.status
    })),
    andons: andons.map((a) => ({
      id: a.id,
      stepId: a.step_id,
      reason: redactTaskPrivatePaths(a.reason, t.input_path),
      impact: redactTaskPrivatePaths(a.impact, t.input_path),
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
      detail: redactTaskPrivatePaths(v.detail, t.input_path)
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      sourceType: e.source_type,
      locator: e.locator,
      excerpt: e.excerpt,
      verificationStatus: e.verification_status,
      snapshotPath:
        (artifacts.find((a) => a.id === e.artifact_id)?.local_path as string | null | undefined) ?? null
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

/**
 * 列表投影：固定 5 条批量查询，与任务数无关。
 * 不读取 Brief、输入路径、产物正文、Evidence、Approval、Andon 与事件计数——
 * 列表页面一个都用不到，而它们正是完整 TaskView 的体积来源。
 */
export function listTaskSummaries(): TaskSummaryView[] {
  const db = getDb()
  const tasks = db
    .prepare(
      `SELECT t.id, t.goal, t.status, t.recipe_id AS recipeId,
              t.input_path AS inputPath,
              t.project_id AS projectId, p.name AS projectName,
              t.agent_id AS agentId, t.agent_name_snapshot AS agentName,
              t.created_at AS createdAt, t.updated_at AS updatedAt
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       ORDER BY t.created_at DESC`
    )
    .all() as Array<{
    id: string
    goal: string
    status: InternalStatus
    recipeId: string
    inputPath: string
    projectId: string | null
    projectName: string | null
    agentId: string | null
    agentName: string | null
    createdAt: string
    updatedAt: string
  }>
  if (tasks.length === 0) return []

  const latestRuns = db
    .prepare(
      `SELECT r.task_id AS taskId, r.id AS runId
       FROM runs r
       WHERE r.rowid = (
         SELECT r2.rowid FROM runs r2 WHERE r2.task_id = r.task_id
         ORDER BY r2.rowid DESC LIMIT 1
       )`
    )
    .all() as Array<{ taskId: string; runId: string }>
  const runByTask = new Map(latestRuns.map((row) => [row.taskId, row.runId]))
  const latestRunIds = new Set(runByTask.values())

  const steps = db
    .prepare(
      `SELECT run_id AS runId, status, title, output_summary AS outputSummary
       FROM steps ORDER BY run_id, idx`
    )
    .all() as Array<{
    runId: string
    status: string
    title: string
    outputSummary: string | null
  }>
  const progressByRun = new Map<string, { running: string | null; lastDone: string | null }>()
  for (const step of steps) {
    if (!latestRunIds.has(step.runId)) continue
    const entry = progressByRun.get(step.runId) ?? { running: null, lastDone: null }
    if (step.status === 'running' && entry.running === null) entry.running = step.title
    if (step.status === 'done') entry.lastDone = step.outputSummary ?? step.title
    progressByRun.set(step.runId, entry)
  }

  const callCounts = db
    .prepare(
      `SELECT s.run_id AS runId,
              SUM(CASE WHEN c.kind = 'model' THEN 1 ELSE 0 END) AS modelCalls,
              SUM(CASE WHEN c.kind = 'tool' THEN 1 ELSE 0 END) AS toolCalls
       FROM steps s
       JOIN (
         SELECT step_id, 'model' AS kind FROM model_calls
         UNION ALL
         SELECT step_id, 'tool' AS kind FROM tool_calls
       ) c ON c.step_id = s.id
       GROUP BY s.run_id`
    )
    .all() as Array<{ runId: string; modelCalls: number; toolCalls: number }>
  const countsByRun = new Map(callCounts.map((row) => [row.runId, row]))

  const deliverables = db
    .prepare(
      `SELECT task_id AS taskId, id, title, version
       FROM artifacts WHERE is_deliverable = 1
       ORDER BY created_at`
    )
    .all() as Array<TaskSummaryDeliverable & { taskId: string }>
  const deliverablesByTask = new Map<string, TaskSummaryDeliverable[]>()
  for (const item of deliverables) {
    const values = deliverablesByTask.get(item.taskId) ?? []
    values.push({ id: item.id, title: item.title, version: item.version })
    deliverablesByTask.set(item.taskId, values)
  }

  return tasks.map((task) => {
    const runId = runByTask.get(task.id)
    const progress = runId ? progressByRun.get(runId) : undefined
    const counts = runId ? countsByRun.get(runId) : undefined
    const { inputPath, ...summarySource } = task
    return buildTaskSummary({
      ...summarySource,
      queuePosition: getQueuePosition(task.id),
      runningStepTitle: progress?.running ?? null,
      // 步骤说明可能含 Task 私有绝对路径。完整 TaskView 会脱敏，列表投影必须用同一规则，
      // 否则同一行的文案会随它来自 listTasks 还是推送派生而不同。
      lastDoneLabel: redactTaskPrivatePaths(progress?.lastDone ?? null, inputPath),
      modelCalls: counts?.modelCalls ?? 0,
      toolCalls: counts?.toolCalls ?? 0,
      deliverables: deliverablesByTask.get(task.id) ?? []
    })
  })
}

export function publishTask(taskId: string): void {
  publish({ type: 'task', task: buildTaskView(taskId) })
}

export function buildRunDetail(taskId: string): RunDetailView {
  const db = getDb()
  const task = db.prepare('SELECT id, input_path FROM tasks WHERE id = ?').get(taskId) as
    | { id: string; input_path: string }
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
      outputSummary: redactTaskPrivatePaths(s.output_summary, task.input_path),
      startedAt: s.started_at,
      endedAt: s.ended_at,
      toolCalls: (toolCallsByStep.get(s.id) ?? []).map((tc) => ({
        id: tc.id,
        toolId: tc.tool_id,
        toolVersion: tc.tool_version,
        status: tc.status,
        riskLevel: tc.risk_level as RunDetailView['steps'][number]['toolCalls'][number]['riskLevel'],
        retryCount: tc.retry_count,
        outputSummary: redactTaskPrivatePaths(tc.output_summary, task.input_path),
        error: redactTaskPrivatePaths(tc.error, task.input_path),
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
        error: redactTaskPrivatePaths(mc.error, task.input_path),
        createdAt: mc.created_at
      })),
      verifications: (verificationsByStep.get(s.id) ?? []).map((v) => ({
        id: v.id,
        kind: v.kind as RunDetailView['steps'][number]['verifications'][number]['kind'],
        status: v.status as RunDetailView['steps'][number]['verifications'][number]['status'],
        detail: redactTaskPrivatePaths(v.detail, task.input_path)
      }))
    })),
    events: events.map((e) => ({
      seq: e.seq,
      type: e.type,
      stepId: e.step_id,
      payload: projectSafeRunEventPayload(e.type, e.payload),
      createdAt: e.created_at
    }))
  }
}
