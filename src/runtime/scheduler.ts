import { getRuntimeConfig } from './config'
import { getDb } from './db'
import { drive } from './engine'
import { getStatus } from './state'

let queue: string[] = []
const activeSlots = new Set<string>()
const activeAgentIds = new Map<string, string | null>()
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

interface TaskAgentPolicy {
  agentId: string | null
  maxConcurrentRuns: number
}

function taskAgentPolicy(taskId: string): TaskAgentPolicy {
  const row = getDb()
    .prepare(
      `SELECT t.agent_id as agentId, a.max_concurrent_runs as maxConcurrentRuns
       FROM tasks t LEFT JOIN agents a ON a.id = t.agent_id
       WHERE t.id = ?`
    )
    .get(taskId) as
    | { agentId: string | null; maxConcurrentRuns: number | null }
    | undefined
  return {
    agentId: row?.agentId ?? null,
    maxConcurrentRuns: row?.agentId ? (row.maxConcurrentRuns ?? 1) : Number.MAX_SAFE_INTEGER
  }
}

export function agentCapacityAvailable(
  activeAgents: (string | null)[],
  candidateAgentId: string | null,
  maxConcurrentRuns: number
): boolean {
  if (!candidateAgentId) return true
  return activeAgents.filter((agentId) => agentId === candidateAgentId).length < maxConcurrentRuns
}

function hasAgentCapacity(policy: TaskAgentPolicy): boolean {
  return agentCapacityAvailable(
    [...activeAgentIds.values()],
    policy.agentId,
    policy.maxConcurrentRuns
  )
}

function beginRun(taskId: string, policy: TaskAgentPolicy): void {
  activeSlots.add(taskId)
  activeAgentIds.set(taskId, policy.agentId)
  void drive(taskId).finally(() => release(taskId))
}

export function requestRun(taskId: string): void {
  if (activeSlots.has(taskId)) {
    pendingRerun.add(taskId)
    return
  }
  if (queue.includes(taskId)) return
  const policy = taskAgentPolicy(taskId)
  if (activeSlots.size >= maxActiveTasks() || !hasAgentCapacity(policy)) {
    queue = enqueue(queue, taskId)
    return
  }
  beginRun(taskId, policy)
}

function drainQueue(): void {
  while (activeSlots.size < maxActiveTasks()) {
    const deferred: string[] = []
    let selected: { taskId: string; policy: TaskAgentPolicy } | null = null
    while (queue.length > 0) {
      const { taskId, rest } = dequeueNext(queue)
      queue = rest
      if (taskId === null) break
      if (getStatus(taskId) !== 'queued') continue
      const policy = taskAgentPolicy(taskId)
      if (!hasAgentCapacity(policy)) {
        deferred.push(taskId)
        continue
      }
      selected = { taskId, policy }
      break
    }
    queue = [...deferred, ...queue]
    if (!selected) return
    beginRun(selected.taskId, selected.policy)
  }
}

export function release(taskId: string): void {
  activeSlots.delete(taskId)
  activeAgentIds.delete(taskId)
  const needsRerun = pendingRerun.has(taskId)
  pendingRerun.delete(taskId)
  if (needsRerun && getStatus(taskId) === 'queued') {
    queue = enqueue(queue, taskId)
  }
  drainQueue()
}

export function getQueuePosition(taskId: string): number | null {
  return queuePositionOf(queue, taskId)
}
