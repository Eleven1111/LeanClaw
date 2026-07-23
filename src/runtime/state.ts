import { getDb, now } from './db'
import { canTransition } from '../shared/machine'
import type { InternalStatus } from '../shared/types'
import { appendEvent } from './ledger'
import { publishTask } from './views'

export function getStatus(taskId: string): InternalStatus {
  const row = getDb().prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as
    | { status: InternalStatus }
    | undefined
  if (!row) throw new Error('任务不存在: ' + taskId)
  return row.status
}

export function transition(taskId: string, to: InternalStatus, shouldPublish = true): boolean {
  const from = getStatus(taskId)
  if (from === to) return false
  if (!canTransition(from, to)) {
    throw new Error(`非法状态转换 ${from} -> ${to}（task ${taskId}）`)
  }
  getDb().prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(to, now(), taskId)
  appendEvent(taskId, 'status-changed', { from, to })
  if (shouldPublish) publishTask(taskId)
  return true
}

export function tryTransition(taskId: string, to: InternalStatus): boolean {
  const from = getStatus(taskId)
  if (from === to || !canTransition(from, to)) return false
  return transition(taskId, to)
}
