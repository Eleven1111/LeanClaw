import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agentCapacityAvailable,
  dequeueNext,
  enqueue,
  getSchedulerSnapshot,
  queuePositionOf,
  release,
  removeQueuedRun,
  requestRun
} from '../src/runtime/scheduler'

const driveMock = vi.fn()
const getStatusMock = vi.fn()
const getAgentPolicyMock = vi.fn()

vi.mock('../src/runtime/engine', () => ({
  drive: (...args: unknown[]) => driveMock(...args)
}))
vi.mock('../src/runtime/state', () => ({
  getStatus: (...args: unknown[]) => getStatusMock(...args)
}))
vi.mock('../src/runtime/config', () => ({
  getRuntimeConfig: () => ({ maxActiveTasks: 3 })
}))
vi.mock('../src/runtime/db', () => ({
  getDb: () => ({
    prepare: () => ({
      get: (...args: unknown[]) => getAgentPolicyMock(...args)
    })
  })
}))

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('enqueue（FIFO 去重）', () => {
  it('追加新任务到队尾', () => {
    expect(enqueue(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('已在队列中的任务不重复追加', () => {
    expect(enqueue(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('不修改原数组（不可变）', () => {
    const q = ['a']
    const next = enqueue(q, 'b')
    expect(q).toEqual(['a'])
    expect(next).toEqual(['a', 'b'])
  })
})

describe('dequeueNext（FIFO 出队）', () => {
  it('从队首取出任务，其余保留原顺序', () => {
    const { taskId, rest } = dequeueNext(['a', 'b', 'c'])
    expect(taskId).toBe('a')
    expect(rest).toEqual(['b', 'c'])
  })

  it('空队列返回 null 且 rest 为空数组', () => {
    const { taskId, rest } = dequeueNext([])
    expect(taskId).toBeNull()
    expect(rest).toEqual([])
  })
})

describe('queuePositionOf（1-based 位次）', () => {
  it('队首位次为 1', () => {
    expect(queuePositionOf(['a', 'b', 'c'], 'a')).toBe(1)
  })

  it('队尾位次为长度', () => {
    expect(queuePositionOf(['a', 'b', 'c'], 'c')).toBe(3)
  })

  it('不在队列中返回 null', () => {
    expect(queuePositionOf(['a', 'b'], 'z')).toBeNull()
  })
})

describe('Agent 并发容量', () => {
  it('无 Agent 的任务不受 Agent 容量限制', () => {
    expect(agentCapacityAvailable(['agent-a'], null, 1)).toBe(true)
  })

  it('同一 Agent 达到上限时排队', () => {
    expect(agentCapacityAvailable(['agent-a'], 'agent-a', 1)).toBe(false)
    expect(agentCapacityAvailable(['agent-a'], 'agent-a', 2)).toBe(true)
  })

  it('不同 Agent 各自拥有独立容量', () => {
    expect(agentCapacityAvailable(['agent-a'], 'agent-b', 1)).toBe(true)
  })
})

describe('requestRun / release（技术债 #11：活跃任务重入不再静默丢弃）', () => {
  beforeEach(() => {
    driveMock.mockReset()
    getStatusMock.mockReset()
    getAgentPolicyMock.mockReset()
    getAgentPolicyMock.mockReturnValue({ agentId: null, maxConcurrentRuns: null })
  })

  it('对活跃中任务重入请求标记 pendingRerun，release 时若仍 queued 则重新驱动', async () => {
    const d = deferred<void>()
    driveMock.mockReturnValue(d.promise)
    getStatusMock.mockReturnValue('queued')

    requestRun('reentry-1')
    expect(driveMock).toHaveBeenCalledTimes(1)

    // 任务仍在执行中时的重入请求：修复前会被静默丢弃
    requestRun('reentry-1')
    expect(driveMock).toHaveBeenCalledTimes(1)

    d.resolve()
    await flushMicrotasks()

    expect(driveMock).toHaveBeenCalledTimes(2)
  })

  it('release 直接调用（模拟 drive 完成回调）对未占用槽位的任务不抛错', () => {
    expect(() => release('never-requested-task')).not.toThrow()
  })

  it('重入请求标记后若 release 时状态已非 queued 则不重新驱动', async () => {
    const d = deferred<void>()
    driveMock.mockReturnValue(d.promise)
    getStatusMock.mockReturnValue('paused_by_user')

    requestRun('reentry-2')
    requestRun('reentry-2')
    d.resolve()
    await flushMicrotasks()

    expect(driveMock).toHaveBeenCalledTimes(1)
  })

  it('非活跃任务的重入请求（未曾 requestRun）不受影响，仍按原逻辑驱动', async () => {
    const d = deferred<void>()
    driveMock.mockReturnValue(d.promise)
    getStatusMock.mockReturnValue('queued')

    requestRun('reentry-3')
    expect(driveMock).toHaveBeenCalledTimes(1)
    d.resolve()
    await flushMicrotasks()
    // 无重入标记，drive 完成后应走队列分支（队列为空，不再次驱动）
    expect(driveMock).toHaveBeenCalledTimes(1)
  })

  it('同一 Agent 达到上限时排队，但不同 Agent 可占用另一全局槽位', async () => {
    const pending = new Map<string, ReturnType<typeof deferred<void>>>()
    driveMock.mockImplementation((taskId: string) => {
      const task = deferred<void>()
      pending.set(taskId, task)
      return task.promise
    })
    getStatusMock.mockReturnValue('queued')
    getAgentPolicyMock.mockImplementation((taskId: string) => ({
      agentId: taskId.startsWith('a') ? 'agent-a' : 'agent-b',
      maxConcurrentRuns: 1
    }))

    requestRun('a-1')
    requestRun('a-2')
    requestRun('b-1')
    expect(driveMock.mock.calls.map(([taskId]) => taskId)).toEqual(['a-1', 'b-1'])
    expect(getSchedulerSnapshot()).toEqual({
      activeTasks: 2,
      queuedTasks: 1,
      maxActiveTasks: 3
    })

    pending.get('a-1')?.resolve()
    await flushMicrotasks()
    expect(driveMock.mock.calls.map(([taskId]) => taskId)).toEqual(['a-1', 'b-1', 'a-2'])
    expect(getSchedulerSnapshot()).toEqual({
      activeTasks: 2,
      queuedTasks: 0,
      maxActiveTasks: 3
    })

    pending.get('b-1')?.resolve()
    pending.get('a-2')?.resolve()
    await flushMicrotasks()
    expect(getSchedulerSnapshot()).toEqual({
      activeTasks: 0,
      queuedTasks: 0,
      maxActiveTasks: 3
    })
  })

  it('暂停或取消前移除排队项，不让 overview 继续计数', async () => {
    const active = deferred<void>()
    driveMock.mockReturnValue(active.promise)
    getStatusMock.mockReturnValue('queued')
    getAgentPolicyMock.mockReturnValue({
      agentId: 'agent-a',
      maxConcurrentRuns: 1
    })

    requestRun('queued-owner')
    requestRun('queued-to-remove')
    expect(getSchedulerSnapshot().queuedTasks).toBe(1)

    removeQueuedRun('queued-to-remove')
    expect(getSchedulerSnapshot().queuedTasks).toBe(0)

    active.resolve()
    await flushMicrotasks()
    expect(driveMock.mock.calls.map(([taskId]) => taskId)).toEqual(['queued-owner'])
  })
})
