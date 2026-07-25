import { afterEach, describe, expect, it, vi } from 'vitest'

interface FakeSchedule {
  id: string
  goal: string
  input_path: string
  recipe_id: string
  project_id: string | null
  agent_id: string | null
  budget_usd: number | null
  cadence: 'daily'
  time_of_day: string
  day_of_week: number | null
  next_run_at: string
  enabled: number
}

const mocks = vi.hoisted(() => ({
  schedules: [] as FakeSchedule[],
  failListing: false,
  failClaimFor: null as string | null
}))

vi.mock('../src/runtime/db', () => ({
  now: () => '2026-07-25T00:00:00.000Z',
  getDb: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (mocks.failListing) throw new Error('database is locked')
        return mocks.schedules.filter((schedule) => schedule.enabled === 1)
      },
      get: (id: string) => mocks.schedules.find((schedule) => schedule.id === id),
      run: (...params: unknown[]) => {
        if (sql.startsWith('UPDATE') && params.at(-1) === mocks.failClaimFor) {
          throw new Error('claim failed')
        }
        return { changes: 1 }
      }
    }),
    transaction: (fn: () => unknown) => fn
  })
}))

const { runDueSchedules, startScheduleLoop } = await import('../src/runtime/schedules')

function schedule(id: string): FakeSchedule {
  return {
    id,
    goal: `目标 ${id}`,
    input_path: '',
    recipe_id: 'file-edit-summarize',
    project_id: null,
    agent_id: null,
    budget_usd: null,
    cadence: 'daily',
    time_of_day: '08:00',
    day_of_week: null,
    next_run_at: '2020-01-01T00:00:00.000Z',
    enabled: 1
  }
}

afterEach(() => {
  mocks.schedules = []
  mocks.failListing = false
  mocks.failClaimFor = null
})

describe('runDueSchedules 的触发失败隔离', () => {
  it('单个计划触发抛错时不向上抛出，同批后续计划仍被触发', async () => {
    mocks.schedules = [schedule('s-broken'), schedule('s-healthy')]
    const triggered: string[] = []

    await expect(
      runDueSchedules(async (due) => {
        if (due.id === 's-broken') throw new Error('创建任务失败')
        triggered.push(due.id)
      })
    ).resolves.toBe(2)

    expect(triggered).toEqual(['s-healthy'])
  })

  it('把失败的计划 id 和原始错误交给 onError 上报', async () => {
    mocks.schedules = [schedule('s-broken')]
    const onError = vi.fn()

    await runDueSchedules(
      async () => {
        throw new Error('创建任务失败')
      },
      new Date(),
      onError
    )

    expect(onError).toHaveBeenCalledTimes(1)
    const failure = onError.mock.calls[0][0] as { scheduleId: string | null; error: unknown }
    expect(failure.scheduleId).toBe('s-broken')
    expect((failure.error as Error).message).toBe('创建任务失败')
  })

  it('认领事务抛错时跳过该计划并继续处理同批其余计划', async () => {
    mocks.schedules = [schedule('s-claim-fail'), schedule('s-healthy')]
    mocks.failClaimFor = 's-claim-fail'
    const triggered: string[] = []
    const onError = vi.fn()

    await runDueSchedules(
      async (due) => {
        triggered.push(due.id)
      },
      new Date(),
      onError
    )

    expect(triggered).toEqual(['s-healthy'])
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('onError 自身抛错不会破坏调度循环', async () => {
    mocks.schedules = [schedule('s-broken'), schedule('s-healthy')]
    const triggered: string[] = []

    await expect(
      runDueSchedules(
        async (due) => {
          if (due.id === 's-broken') throw new Error('创建任务失败')
          triggered.push(due.id)
        },
        new Date(),
        () => {
          throw new Error('上报也失败了')
        }
      )
    ).resolves.toBe(2)

    expect(triggered).toEqual(['s-healthy'])
  })
})

describe('startScheduleLoop 的进程存活保证', () => {
  it('首个 tick 遇到数据库错误时通过 onError 上报，不产生未处理拒绝', async () => {
    mocks.failListing = true
    const onError = vi.fn()
    const rejections: unknown[] = []
    const capture = (reason: unknown): void => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', capture)

    const stop = startScheduleLoop(async () => undefined, onError)
    try {
      await vi.waitFor(() => expect(onError).toHaveBeenCalled())
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(rejections).toEqual([])
    } finally {
      stop()
      process.off('unhandledRejection', capture)
    }
  })
})
