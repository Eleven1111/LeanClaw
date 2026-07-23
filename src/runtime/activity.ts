import { getDb } from './db'
import {
  ACTIVITY_EVENT_TYPES,
  normalizeActivityLimit,
  projectRunEventToActivity,
  type ActivityProjectionInput
} from '../shared/activity'
import type { ActivityView, EventActorType } from '../shared/types'

type ActivityRow = {
  seq: number
  taskId: string
  runId: string | null
  stepId: string | null
  type: string
  payload: string | null
  actorType: EventActorType | null
  actorId: string | null
  actorNameSnapshot: string | null
  createdAt: string
}

export function getTaskActivity(
  taskId: string,
  limit?: number,
  beforeSeq?: number
): ActivityView[] {
  const db = getDb()
  if (!db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId)) {
    throw new Error(`Task 不存在: ${taskId}`)
  }
  const normalizedLimit = normalizeActivityLimit(limit)
  if (
    beforeSeq !== undefined &&
    (!Number.isSafeInteger(beforeSeq) || beforeSeq < 1)
  ) {
    throw new Error('Activity beforeSeq 必须是正整数')
  }
  const beforeClause = beforeSeq === undefined ? '' : 'AND seq < ?'
  const eventPlaceholders = ACTIVITY_EVENT_TYPES.map(() => '?').join(', ')
  const statement = db.prepare(
    `SELECT seq, task_id as taskId, run_id as runId, step_id as stepId,
            type, payload, actor_type as actorType, actor_id as actorId,
            actor_name_snapshot as actorNameSnapshot, created_at as createdAt
     FROM run_events
     WHERE task_id = ?
       AND type IN (${eventPlaceholders})
       ${beforeClause}
     ORDER BY seq DESC
     LIMIT ?`
  )
  const parameters: (string | number)[] = [
    taskId,
    ...ACTIVITY_EVENT_TYPES,
    ...(beforeSeq === undefined ? [] : [beforeSeq]),
    normalizedLimit
  ]
  const rows = statement.all(...parameters) as ActivityRow[]

  return rows
    .map((row) => projectRunEventToActivity(row satisfies ActivityProjectionInput))
    .filter((activity): activity is ActivityView => activity !== null)
    .reverse()
}
