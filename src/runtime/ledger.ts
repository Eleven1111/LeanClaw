import { getDb, now } from './db'
import { summarizeEvents } from '../shared/governance'

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

export function archiveTaskEvents(taskId: string): { archived: number } {
  const db = getDb()
  const rows = db.prepare(
    'SELECT seq, task_id, run_id, step_id, type, payload, created_at FROM run_events WHERE task_id = ? ORDER BY seq'
  ).all(taskId) as {
    seq: number
    task_id: string
    run_id: string | null
    step_id: string | null
    type: string
    payload: string | null
    created_at: string
  }[]
  if (rows.length === 0) return { archived: 0 }
  const summary = summarizeEvents(rows.map((row) => ({ type: row.type, createdAt: row.created_at })))
  const archivedAt = now()
  db.transaction(() => {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO run_events_archive
       (original_seq, task_id, run_id, step_id, type, payload, created_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const row of rows) {
      insert.run(row.seq, row.task_id, row.run_id, row.step_id, row.type, row.payload, row.created_at, archivedAt)
    }
    db.prepare('DELETE FROM run_events WHERE task_id = ?').run(taskId)
    db.prepare(
      `INSERT INTO run_events (task_id, run_id, step_id, type, payload, created_at)
       VALUES (?, NULL, NULL, 'events-archived', ?, ?)`
    ).run(taskId, JSON.stringify(summary), archivedAt)
  })()
  return { archived: rows.length }
}
