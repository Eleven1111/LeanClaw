import { getRuntimeConfig } from './config'
import { drive } from './engine'
import { getStatus } from './state'

let queue: string[] = []
const activeSlots = new Set<string>()
const pendingRerun = new Set<string>()

export function enqueue(q: string[], taskId: string): string[] {
  return q.includes(taskId) ? q : [...q, taskId]
}

export function dequeueNext(q: string[]): { taskId: string | null; rest: string[] } {
  if (q.length === 0) return { taskId: null, rest: q }
  const [next, ...rest] = q
  return { taskId: next, rest }
}

export function queuePositionOf(q: string[], taskId: string): number | null {
  const idx = q.indexOf(taskId)
  return idx === -1 ? null : idx + 1
}

function maxActiveTasks(): number {
  return getRuntimeConfig().maxActiveTasks
}

export function requestRun(taskId: string): void {
  if (activeSlots.has(taskId)) {
    pendingRerun.add(taskId)
    return
  }
  if (queue.includes(taskId)) return
  if (activeSlots.size >= maxActiveTasks()) {
    queue = enqueue(queue, taskId)
    return
  }
  activeSlots.add(taskId)
  void drive(taskId).finally(() => release(taskId))
}

export function release(taskId: string): void {
  activeSlots.delete(taskId)
  const needsRerun = pendingRerun.has(taskId)
  pendingRerun.delete(taskId)
  if (needsRerun && getStatus(taskId) === 'queued') {
    requestRun(taskId)
    return
  }
  while (true) {
    const { taskId: next, rest } = dequeueNext(queue)
    queue = rest
    if (next === null) return
    if (getStatus(next) !== 'queued') continue
    requestRun(next)
    return
  }
}

export function getQueuePosition(taskId: string): number | null {
  return queuePositionOf(queue, taskId)
}
