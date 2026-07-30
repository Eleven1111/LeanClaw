// T07：Automation 在真实 Runtime 里遭遇数据库级故障时的行为证据。
//
// 故障是真实的、固定的、可移除的：向 `tasks` 挂一个 `BEFORE INSERT ... RAISE(ABORT)` 触发器，
// 由外部 sqlite3 注入。它不是 mock，也不是随机失败，命中的正是 Automation 触发时唯一必须
// 写库的动作。产品代码里没有为此加任何测试后门。
//
// 要证明的四件事：不制造假成功、不制造重复 Task、不无提示跳过、事件/队列/UI 结论一致。
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import type { NeedYouItemView, ScheduleView, TaskSummaryView } from '../../src/shared/types'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

// Runtime 正持有这个库，CLI 默认 busy timeout 为 0 会立刻报 database is locked（T05 教训）
function sqlite(dbPath: string, sql: string): string {
  return execFileSync('/usr/bin/sqlite3', ['-cmd', '.timeout 5000', dbPath, sql], {
    encoding: 'utf8'
  }).trim()
}

const INJECT_TASK_INSERT_FAULT = `
CREATE TRIGGER t07_task_insert_fault BEFORE INSERT ON tasks
BEGIN
  SELECT RAISE(ABORT, 'T07 injected database fault');
END;`

async function rpc<T>(window: LaunchedApp['window'], request: unknown): Promise<T> {
  return window.evaluate(async (req) => {
    const api = (globalThis as unknown as { api: { rpc(r: unknown): Promise<unknown> } }).api
    return api.rpc(req)
  }, request) as Promise<T>
}

async function scheduleById(
  window: LaunchedApp['window'],
  scheduleId: string
): Promise<ScheduleView> {
  const schedules = await rpc<ScheduleView[]>(window, { method: 'listSchedules' })
  const found = schedules.find((item) => item.id === scheduleId)
  if (!found) throw new Error(`未找到自动化 ${scheduleId}`)
  return found
}

function tasksForSchedule(dbPath: string, scheduleId: string): number {
  return Number(sqlite(dbPath, `SELECT COUNT(*) FROM tasks WHERE schedule_id = '${scheduleId}'`))
}

async function waitFor(
  check: () => Promise<boolean>,
  label: string | (() => string)
): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`等待超时：${typeof label === 'string' ? label : label()}`)
}

test('T07：Automation 遭遇 DB 故障后不假成功、不重复、不静默跳过，恢复后只创建一个 Task', async () => {
  test.setTimeout(150_000)
  // 缩短调度间隔只是加快 tick，不改变判定逻辑；不用固定 sleep 掩盖失败
  launched = await launchApp({ LEANCLAW_SCHEDULE_INTERVAL_MS: '400' })
  const { window, dataDir } = launched
  const dbPath = join(dataDir, 'leanclaw.db')
  const rendererErrors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  window.on('pageerror', (error) => rendererErrors.push(error.message))

  const created = await rpc<ScheduleView>(window, {
    method: 'saveSchedule',
    name: 'T07 故障注入自动化',
    goal: '验证 DB 故障下的自动化行为',
    inputPath: join(dataDir, 'workspace', 'notes.md'),
    recipeId: 'file-edit-summarize',
    cadence: 'daily',
    timeOfDay: '23:59'
  })
  const scheduleId = created.id
  expect(created.lastTriggerFailed).toBe(false)
  expect(created.lastTaskId).toBeNull()

  // 1) 注入固定 DB 故障点，然后把这个自动化置为已到期
  sqlite(dbPath, INJECT_TASK_INSERT_FAULT)
  sqlite(
    dbPath,
    `UPDATE schedules SET next_run_at = '2020-01-01T00:00:00.000Z' WHERE id = '${scheduleId}'`
  )

  // 认领一定会发生（认领本身不写 tasks），因此 last_triggered_at 会前进
  await waitFor(
    async () =>
      sqlite(dbPath, `SELECT COALESCE(last_triggered_at,'') FROM schedules WHERE id='${scheduleId}'`)
        .length > 0,
    '自动化被认领'
  )

  // 2) 不制造假成功、不制造重复 Task：一个 Task 都没有落地
  expect(tasksForSchedule(dbPath, scheduleId)).toBe(0)
  // 认领后 next_run_at 前进，这是刻意保留的语义：回退它会让坏计划每个 tick 热重试
  expect(
    sqlite(dbPath, `SELECT next_run_at > '2020-01-01T00:00:00.000Z' FROM schedules WHERE id='${scheduleId}'`)
  ).toBe('1')

  // 3) Runtime 没有被一个失败的自动化拖垮
  const tasksDuringFault = await rpc<TaskSummaryView[]>(window, { method: 'listTasks' })
  expect(tasksDuringFault.some((task) => task.goal === '验证 DB 故障下的自动化行为')).toBe(false)

  // 4) 不无提示跳过：投影与 UI 都把这次到期认领报告为触发失败
  await waitFor(
    async () => (await scheduleById(window, scheduleId)).lastTriggerFailed,
    'listSchedules 报告触发失败'
  )
  const failedView = await scheduleById(window, scheduleId)
  expect(failedView.lastTaskId).toBeNull()
  expect(failedView.lastTriggeredAt).not.toBeNull()

  await window.getByRole('button', { name: 'Automations' }).click()
  const card = window.locator('.automation-card', { hasText: 'T07 故障注入自动化' })
  await expect(card).toContainText('触发失败', { timeout: 15_000 })
  await expect(card).toContainText('未创建任务，原因见诊断')

  // 5) 事件与 Need You 的结论一致：没有 Task，就不该凭空出现事件或待办
  expect(sqlite(dbPath, `SELECT COUNT(*) FROM run_events WHERE task_id LIKE '%'
    AND task_id NOT IN (SELECT id FROM tasks)`)).toBe('0')
  const needYou = await rpc<NeedYouItemView[]>(window, { method: 'listNeedYouItems' })
  expect(needYou).toEqual([])

  // 6) 移除故障并再次置为到期：恢复是向前的，且只创建一个 Task
  sqlite(dbPath, 'DROP TRIGGER t07_task_insert_fault')
  sqlite(
    dbPath,
    `UPDATE schedules SET next_run_at = '2020-01-01T00:00:00.000Z' WHERE id = '${scheduleId}'`
  )
  await waitFor(async () => tasksForSchedule(dbPath, scheduleId) === 1, '恢复后创建 Task')

  await waitFor(
    async () => !(await scheduleById(window, scheduleId)).lastTriggerFailed,
    'listSchedules 不再报告触发失败'
  )
  const recovered = await scheduleById(window, scheduleId)
  expect(recovered.lastTaskId).not.toBeNull()
  expect(recovered.lastTriggerSource).toBe('scheduled')
  await expect(card).not.toContainText('触发失败')

  // 7) 队列与状态一致：这个 Task 只入队一次，且两条投影对它的结论相同
  const taskId = recovered.lastTaskId as string
  expect(tasksForSchedule(dbPath, scheduleId)).toBe(1)
  const summary = (await rpc<TaskSummaryView[]>(window, { method: 'listTasks' })).find(
    (task) => task.id === taskId
  )
  const detail = await rpc<{ id: string; status: string; queuePosition: number | null }>(window, {
    method: 'getTask',
    taskId
  })
  expect(summary?.status).toBe(detail.status)
  expect(summary?.queuePosition ?? null).toBe(detail.queuePosition ?? null)

  // 8) 停止后队列位置和状态同时收敛，不留下"排队中但已取消"的矛盾
  await rpc(window, { method: 'stopTask', taskId })
  let lastSeen = ''
  await waitFor(async () => {
    const stopped = await rpc<{ status: string; queuePosition: number | null }>(window, {
      method: 'getTask',
      taskId
    })
    lastSeen = `${stopped.status}/queue=${String(stopped.queuePosition)}`
    return (
      stopped.queuePosition === null &&
      ['cancelled_by_user', 'delivered'].includes(stopped.status)
    )
  }, () => `停止后队列位置清空且状态收敛（最后观察到 ${lastSeen}）`)
  const stoppedSummary = (await rpc<TaskSummaryView[]>(window, { method: 'listTasks' })).find(
    (task) => task.id === taskId
  )
  const stoppedDetail = await rpc<{ status: string; queuePosition: number | null }>(window, {
    method: 'getTask',
    taskId
  })
  expect(stoppedSummary?.status).toBe(stoppedDetail.status)
  expect(stoppedSummary?.queuePosition ?? null).toBeNull()

  // 9) 诊断日志里留下了失败原因，不是只在控制台一闪而过
  const runtimeLog = readFileSync(join(dataDir, 'logs', 'runtime.log'), 'utf8')
  expect(runtimeLog).toContain('schedule-trigger-failed')
  expect(runtimeLog).toContain(scheduleId)
  expect(rendererErrors).toEqual([])
})
