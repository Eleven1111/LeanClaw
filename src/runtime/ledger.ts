import { getDb, now } from './db'

export function appendEvent(
  taskId: string,
  type: string,
  payload?: unknown,
  runId?: string | null,
  stepId?: string | null
): void {
  getDb()
    .prepare(
      'INSERT INTO run_events (task_id, run_id, step_id, type, payload, created_at) VALUES (?,?,?,?,?,?)'
    )
    .run(
      taskId,
      runId ?? null,
      stepId ?? null,
      type,
      payload === undefined ? null : JSON.stringify(payload),
      now()
    )
}
