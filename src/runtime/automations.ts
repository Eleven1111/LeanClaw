import { USER_STATUS_MAP } from '../shared/machine'
import type {
  InternalStatus,
  ScheduleHistoryDeliverableView,
  ScheduleHistoryItemView,
  ScheduleTriggerSource
} from '../shared/types'
import { getDb } from './db'
import { listNeedYouItems } from './need-you'

export function normalizeScheduleHistoryLimit(limit: number | undefined): number {
  if (limit === undefined) return 5
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error('历史数量必须为 1–20 的整数')
  }
  return limit
}

function triggerSource(value: string | null): ScheduleTriggerSource {
  return value === 'manual' ? 'manual' : 'scheduled'
}

export function getScheduleHistory(
  scheduleId: string,
  requestedLimit?: number
): ScheduleHistoryItemView[] {
  const db = getDb()
  if (!db.prepare('SELECT id FROM schedules WHERE id = ?').get(scheduleId)) {
    throw new Error('自动化不存在')
  }
  const limit = normalizeScheduleHistoryLimit(requestedLimit)
  const queriedAt = new Date().toISOString()
  const needYouTaskIds = new Set(listNeedYouItems().map((item) => item.taskId))
  const rows = db.prepare(
    `SELECT
       t.id AS taskId,
       t.goal AS taskGoal,
       t.status,
       t.schedule_trigger_source AS triggerSource,
       t.created_at AS createdAt,
       (SELECT MIN(r.started_at) FROM runs r WHERE r.task_id = t.id) AS startedAt,
       CASE
         WHEN EXISTS (SELECT 1 FROM runs r WHERE r.task_id = t.id AND r.ended_at IS NULL)
           THEN NULL
         ELSE (SELECT MAX(r.ended_at) FROM runs r WHERE r.task_id = t.id)
       END AS endedAt,
       COALESCE((
         SELECT SUM(mc.cost_usd)
         FROM model_calls mc
         JOIN steps st ON st.id = mc.step_id
         JOIN runs rr ON rr.id = st.run_id
         WHERE rr.task_id = t.id
       ), 0) AS costUsd
     FROM tasks t
     WHERE t.schedule_id = ?
     ORDER BY t.created_at DESC, t.rowid DESC
     LIMIT ?`
  ).all(scheduleId, limit) as Array<{
    taskId: string
    taskGoal: string
    status: InternalStatus
    triggerSource: string | null
    createdAt: string
    startedAt: string | null
    endedAt: string | null
    costUsd: number
  }>
  if (rows.length === 0) return []

  const deliverables = db.prepare(
    `SELECT id, task_id AS taskId, title, version
     FROM artifacts
     WHERE is_deliverable = 1
       AND superseded_by IS NULL
       AND task_id IN (${rows.map(() => '?').join(',')})
     ORDER BY created_at DESC, id DESC`
  ).all(...rows.map((row) => row.taskId)) as Array<
    ScheduleHistoryDeliverableView & { taskId: string }
  >
  const byTask = new Map<string, ScheduleHistoryDeliverableView[]>()
  for (const deliverable of deliverables) {
    const values = byTask.get(deliverable.taskId) ?? []
    values.push({
      id: deliverable.id,
      title: deliverable.title,
      version: deliverable.version
    })
    byTask.set(deliverable.taskId, values)
  }

  return rows.map((row) => {
    const startedMs = row.startedAt ? Date.parse(row.startedAt) : Number.NaN
    const endMs = row.endedAt ? Date.parse(row.endedAt) : Date.parse(queriedAt)
    return {
      taskId: row.taskId,
      taskGoal: row.taskGoal,
      userStatus: USER_STATUS_MAP[row.status],
      triggerSource: triggerSource(row.triggerSource),
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationMs: Number.isFinite(startedMs) && Number.isFinite(endMs)
        ? Math.max(0, endMs - startedMs)
        : null,
      costUsd: Number.isFinite(row.costUsd) ? row.costUsd : 0,
      deliverables: byTask.get(row.taskId) ?? [],
      needsAttention: needYouTaskIds.has(row.taskId)
    }
  })
}
