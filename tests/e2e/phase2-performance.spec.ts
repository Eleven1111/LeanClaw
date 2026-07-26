import { execFileSync } from 'child_process'
import { join } from 'path'
import { expect, test, type Page } from '@playwright/test'
import type {
  ActivityView,
  NeedYouItemView,
  RuntimeOverviewView,
  TaskSummaryView
} from '../../src/shared/types'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

const TASK_COUNT = 1_000
const AGENT_COUNT = 100
const EVENTS_PER_TASK = 200
const STEPS_PER_RUN = 7
const SCHEDULE_COUNT = 50
const MCP_COUNT = 20
const MB = 1024 * 1024

interface PerformanceResults {
  taskHydrationMs: number
  listTasksRpcMs: number
  listTasksBytes: number
  getTaskRpcMs: number
  agentPageMs: number
  automationPageMs: number
  needYouRpcMs: number
  recentActivityRpcMs: number
  olderActivityRpcMs: number
  runtimeRpcMs: number[]
  heapBaselineMb: number
  heapMidpointMb: number
  heapFinalMb: number
}

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

function watchRendererErrors(window: Page): string[] {
  const errors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  window.on('pageerror', (error) => errors.push(error.message))
  return errors
}

function seedPerformanceDatabase(dataDir: string): void {
  const dbPath = join(dataDir, 'leanclaw.db')
  const sql = `
    PRAGMA synchronous = OFF;
    BEGIN IMMEDIATE;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${AGENT_COUNT}
    )
    INSERT INTO agents
      (id, name, description, instructions, default_recipe_id, default_budget_usd,
       max_concurrent_runs, enabled, created_at, updated_at)
    SELECT
      printf('perf-agent-%03d', x),
      printf('Performance Agent %03d', x),
      'Phase 2 performance fixture',
      'Keep the fixture deterministic and local.',
      'file-edit-summarize',
      2,
      1,
      CASE WHEN x % 10 = 0 THEN 0 ELSE 1 END,
      '2026-07-23T12:00:00.000Z',
      '2026-07-23T12:00:00.000Z'
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${TASK_COUNT}
    )
    INSERT INTO tasks
      (id, agent_id, agent_name_snapshot, agent_instructions_snapshot,
       goal, input_path, recipe_id, status, created_at, updated_at)
    SELECT
      printf('perf-task-%04d', x),
      printf('perf-agent-%03d', ((x - 1) % ${AGENT_COUNT}) + 1),
      printf('Performance Agent %03d', ((x - 1) % ${AGENT_COUNT}) + 1),
      'Historical Agent instructions snapshot.',
      printf('Phase 2 performance task %04d', x),
      '',
      'file-edit-summarize',
      CASE
        WHEN x <= 10 THEN 'awaiting_approval'
        WHEN x <= 20 THEN 'andon_open'
        WHEN x <= 30 THEN 'verification_failed'
        WHEN x <= 40 THEN 'failed'
        ELSE 'delivered'
      END,
      strftime('%Y-%m-%dT%H:%M:%fZ', '2026-07-23T12:00:00Z',
               printf('-%d seconds', x - 1)),
      strftime('%Y-%m-%dT%H:%M:%fZ', '2026-07-23T12:00:00Z',
               printf('-%d seconds', x - 1))
    FROM n;

    -- 每个 Task 都有 Run 与 Step：真实使用中没有"只有 Task 没有 Run"的任务，
    -- 而步骤时长参考值会按 recipe 聚合历史 Step，缺了它就测不到这条真实路径。
    -- 21–29 保留 failed 状态与原有 run id，以免影响验证失败相关断言。
    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${TASK_COUNT}
    )
    INSERT INTO runs
      (id, task_id, recipe_id, status, current_step_index, started_at, ended_at)
    SELECT
      printf('perf-run-%04d', x),
      printf('perf-task-%04d', x),
      'file-edit-summarize',
      CASE WHEN x BETWEEN 21 AND 29 THEN 'failed' ELSE 'succeeded' END,
      0,
      '2026-07-23T12:00:00.000Z',
      '2026-07-23T12:00:01.000Z'
    FROM n;

    WITH RECURSIVE
      run_number(x) AS (
        SELECT 1 UNION ALL SELECT x + 1 FROM run_number WHERE x < ${TASK_COUNT}
      ),
      step_number(y) AS (
        SELECT 0 UNION ALL SELECT y + 1 FROM step_number WHERE y < ${STEPS_PER_RUN - 1}
      )
    INSERT INTO steps
      (id, run_id, idx, name, title, kind, status, attempt, started_at, ended_at)
    SELECT
      printf('perf-step-%04d-%d', x, y),
      printf('perf-run-%04d', x),
      y,
      'read_input',
      printf('性能夹具步骤 %d', y),
      'tool',
      'succeeded',
      1,
      '2026-07-23T12:00:00.000Z',
      strftime('%Y-%m-%dT%H:%M:%fZ', '2026-07-23T12:00:00Z',
               printf('+%d seconds', y + 1))
    FROM run_number CROSS JOIN step_number;

    -- 交付物带正文：完整 TaskView 会把每个产物的前 4000 字符搬进列表投影，
    -- 夹具此前一条 artifact 都没有，等于完全没测到真实使用中最大的一块 payload。
    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${TASK_COUNT}
    )
    INSERT INTO artifacts
      (id, task_id, run_id, step_id, type, title, version, content, mime_type,
       producer, verification_status, is_deliverable, created_at)
    SELECT
      printf('perf-artifact-%04d', x),
      printf('perf-task-%04d', x),
      printf('perf-run-%04d', x),
      printf('perf-step-%04d-0', x),
      'report',
      printf('性能夹具交付物 %04d', x),
      1,
      printf('%.*c', 6000, 'x'),
      'text/markdown',
      'fixture',
      'verified',
      1,
      '2026-07-23T12:00:02.000Z'
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10
    )
    INSERT INTO approvals
      (id, task_id, run_id, step_id, action_desc, diff, status, requested_at)
    SELECT
      printf('perf-approval-%02d', x),
      printf('perf-task-%04d', x),
      printf('perf-run-%04d', x),
      printf('perf-step-%04d', x),
      'Approve deterministic performance fixture',
      '',
      'pending',
      '2026-07-23T12:00:00.000Z'
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 11 UNION ALL SELECT x + 1 FROM n WHERE x < 20
    )
    INSERT INTO andon_events
      (id, task_id, run_id, reason, impact, recommended_actions,
       status, created_at)
    SELECT
      printf('perf-andon-%02d', x),
      printf('perf-task-%04d', x),
      printf('perf-run-%04d', x),
      '预算已用尽（$2.00/$2.00）',
      '此前步骤的产物仍然有效；可追加预算后重试当前步骤。',
      '["retry","cancel"]',
      'open',
      '2026-07-23T12:00:00.000Z'
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 21 UNION ALL SELECT x + 1 FROM n WHERE x < 30
    )
    INSERT INTO verifications
      (id, run_id, step_id, kind, status, detail, created_at)
    SELECT
      printf('perf-verification-%02d', x),
      printf('perf-run-%04d', x),
      printf('perf-step-%04d', x),
      'evidence',
      'failed',
      'Performance fixture verification failed.',
      '2026-07-23T12:00:00.000Z'
    FROM n;

    WITH RECURSIVE
      task_number(x) AS (
        SELECT 1 UNION ALL SELECT x + 1 FROM task_number WHERE x < ${TASK_COUNT}
      ),
      event_number(y) AS (
        SELECT 1 UNION ALL SELECT y + 1 FROM event_number WHERE y < ${EVENTS_PER_TASK}
      )
    INSERT INTO run_events
      (task_id, type, payload, actor_type, actor_name_snapshot, created_at)
    SELECT
      printf('perf-task-%04d', x),
      CASE WHEN x BETWEEN 11 AND 20 AND y = ${EVENTS_PER_TASK}
        THEN 'andon-opened'
        ELSE 'brief-edited'
      END,
      CASE WHEN x BETWEEN 11 AND 20 AND y = ${EVENTS_PER_TASK}
        THEN json_object('andonId', printf('perf-andon-%02d', x), 'category', 'budget')
        ELSE '{}'
      END,
      'user',
      '你',
      strftime('%Y-%m-%dT%H:%M:%fZ', '2026-07-23T12:00:00Z',
               printf('+%d seconds', y))
    FROM task_number CROSS JOIN event_number;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${SCHEDULE_COUNT}
    )
    INSERT INTO schedules
      (id, name, goal, input_path, recipe_id, agent_id, budget_usd, cadence,
       time_of_day, day_of_week, next_run_at, enabled, created_at, updated_at)
    SELECT
      printf('perf-schedule-%02d', x),
      printf('Performance Automation %02d', x),
      printf('Run deterministic performance automation %02d', x),
      '',
      'file-edit-summarize',
      printf('perf-agent-%03d', ((x - 1) % ${AGENT_COUNT}) + 1),
      2,
      CASE WHEN x % 3 = 0 THEN 'weekly' ELSE 'daily' END,
      '08:00',
      CASE WHEN x % 3 = 0 THEN x % 7 ELSE NULL END,
      '2026-07-24T08:00:00.000Z',
      CASE WHEN x % 5 = 0 THEN 0 ELSE 1 END,
      '2026-07-23T12:00:00.000Z',
      '2026-07-23T12:00:00.000Z'
    FROM n;

    COMMIT;
  `
  execFileSync('/usr/bin/sqlite3', [dbPath, sql], {
    maxBuffer: 10 * MB,
    timeout: 60_000
  })
}

async function getHeapUsed(page: Page, app: LaunchedApp['app']): Promise<number> {
  const cdp = await app.context().newCDPSession(page)
  try {
    await cdp.send('HeapProfiler.enable')
    await cdp.send('HeapProfiler.collectGarbage')
    const usage = await cdp.send('Runtime.getHeapUsage')
    return usage.usedSize
  } finally {
    await cdp.detach()
  }
}

async function navigateAndWait(
  page: Page,
  buttonName: string,
  readySelector: string,
  expectedCount?: number
): Promise<number> {
  const started = performance.now()
  await page.locator('.sidebar-item').filter({ hasText: buttonName }).click()
  const ready = page.locator(readySelector)
  if (expectedCount === undefined) {
    await expect(ready).toBeVisible()
  } else {
    await expect(ready).toHaveCount(expectedCount)
  }
  return performance.now() - started
}

test('Phase 2 性能：规模数据保持窗口化、分页、固定聚合与稳定 Renderer 堆', async () => {
  test.setTimeout(180_000)

  launched = await launchApp()
  const dataDir = launched.dataDir
  await launched.app.close()
  seedPerformanceDatabase(dataDir)

  const mcpServers = Array.from({ length: MCP_COUNT }, (_, index) => ({
    id: `perf-mcp-${String(index + 1).padStart(2, '0')}`,
    name: `Performance MCP ${String(index + 1).padStart(2, '0')}`,
    command: '/usr/bin/false',
    args: [],
    enabled: false,
    env: {}
  }))
  const hydrationStarted = performance.now()
  launched = await launchApp({}, dataDir)
  const { app, window } = launched
  const rendererErrors = watchRendererErrors(window)

  await expect
    .poll(
      async () => Number(await window.getByRole('button', { name: 'Tasks' })
        .locator('.sidebar-count').textContent()),
      { timeout: 60_000 }
    )
    .toBe(TASK_COUNT)
  const taskHydrationMs = performance.now() - hydrationStarted
  // 注意：这个数字包含整个 Electron 启动过程，改造后已由启动耗时主导
  // （数据路径见下方 listTasksRpcMs，约 30ms）。因此它只作为宽松安全网：
  // 修复前同规模且更轻的夹具为 8.4s，本机稳态 0.55-0.69s、最坏观测 3.0s。
  // 真正紧的、可归因且不随机器抖动的门是 listTasksRpcMs 与 listTasksBytes。
  expect(taskHydrationMs).toBeLessThan(8_000)

  await window.evaluate(async (servers) => {
    const api = (
      globalThis as unknown as {
        api: { upsertMcpServer(input: unknown): Promise<unknown> }
      }
    ).api
    for (const server of servers) await api.upsertMcpServer(server)
  }, mcpServers)
  await expect
    .poll(async () => window.evaluate(async () => {
      const api = (
        globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
      ).api
      const overview = await api.rpc({ method: 'getRuntimeOverview' }) as RuntimeOverviewView
      return overview.mcp.length
    }))
    .toBe(MCP_COUNT)

  await window.getByRole('button', { name: 'Tasks' }).click()
  const virtualList = window.locator('.virtual-task-list')
  await expect(virtualList).toHaveAttribute('data-total-count', String(TASK_COUNT))
  const renderedRows = await virtualList.locator('.task-row').count()
  expect(renderedRows).toBeGreaterThan(0)
  expect(renderedRows).toBeLessThan(40)

  const agentPageMs = await navigateAndWait(window, 'Agent', '.agent-card', AGENT_COUNT)
  expect(agentPageMs).toBeLessThan(5_000)

  const automationPageMs = await navigateAndWait(
    window,
    'Automations',
    '.automation-card',
    SCHEDULE_COUNT
  )
  expect(automationPageMs).toBeLessThan(5_000)

  const rpcMeasurements = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const timed = async <T>(request: unknown): Promise<{ value: T; durationMs: number }> => {
      const started = performance.now()
      const value = await api.rpc(request) as T
      return { value, durationMs: performance.now() - started }
    }

    // 列表 RPC 单独计时：把"取数据"与"渲染水合"分开，
    // 否则一个混合数字无法归因下一次劣化到底出在哪一层。
    const listTasks = await timed<TaskSummaryView[]>({ method: 'listTasks' })
    const listTasksBytes = JSON.stringify(listTasks.value).length
    const getTask = await timed<unknown>({ method: 'getTask', taskId: 'perf-task-0001' })
    const needYou = await timed<NeedYouItemView[]>({ method: 'listNeedYouItems' })
    const recent = await timed<ActivityView[]>({
      method: 'getTaskActivity',
      taskId: 'perf-task-0001',
      limit: 50
    })
    const older = await timed<ActivityView[]>({
      method: 'getTaskActivity',
      taskId: 'perf-task-0001',
      limit: 50,
      beforeSeq: recent.value[0]?.seq
    })
    const runtime: Array<{ value: RuntimeOverviewView; durationMs: number }> = []
    for (let attempt = 0; attempt < 5; attempt += 1) {
      runtime.push(await timed<RuntimeOverviewView>({ method: 'getRuntimeOverview' }))
    }
    return { listTasks, listTasksBytes, getTask, needYou, recent, older, runtime }
  })

  // 摘要投影：固定数量 SQL、与任务数无关，且不携带明细
  expect(rpcMeasurements.listTasks.value).toHaveLength(TASK_COUNT)
  expect(rpcMeasurements.listTasks.durationMs).toBeLessThan(1_000)
  const firstSummary = rpcMeasurements.listTasks.value[0]
  expect(firstSummary).not.toHaveProperty('brief')
  expect(firstSummary).not.toHaveProperty('approvals')
  expect(firstSummary).not.toHaveProperty('artifacts')
  expect(firstSummary).not.toHaveProperty('metrics')
  // 夹具每个任务带 6000 字正文的交付物；摘要绝不能把正文搬进列表
  expect(JSON.stringify(rpcMeasurements.listTasks.value)).not.toContain('xxxxxxxxxx')
  // 实测约 494 字节/任务；完整 TaskView 携带 4000 字正文预览时为 5000+ 字节/任务，
  // 600 的上限足以拦住"把明细搬回列表"的回退。
  expect(rpcMeasurements.listTasksBytes).toBeLessThan(TASK_COUNT * 600)
  expect(rpcMeasurements.getTask.durationMs).toBeLessThan(1_000)
  expect(rpcMeasurements.needYou.value).toHaveLength(40)
  expect(rpcMeasurements.needYou.durationMs).toBeLessThan(2_500)
  expect(rpcMeasurements.recent.value).toHaveLength(50)
  expect(rpcMeasurements.older.value).toHaveLength(50)
  expect(rpcMeasurements.older.value.at(-1)?.seq)
    .toBeLessThan(rpcMeasurements.recent.value[0]?.seq ?? 0)
  expect(rpcMeasurements.recent.durationMs).toBeLessThan(1_500)
  expect(rpcMeasurements.older.durationMs).toBeLessThan(1_500)
  for (const result of rpcMeasurements.runtime) {
    expect(result.value.mcp).toHaveLength(MCP_COUNT)
    expect(result.value.mcp.every((server) => server.state === 'disabled')).toBe(true)
    expect(result.durationMs).toBeLessThan(1_500)
  }

  await window.getByRole('button', { name: 'Tasks' }).click()
  await window
    .locator('.task-row', { hasText: 'Phase 2 performance task 0001' })
    .locator('.task-row-main')
    .click()
  const feed = window.locator('.task-activity-feed')
  await expect(feed.locator('.activity-row')).toHaveCount(20)
  const initialSeqs = await feed.locator('.activity-row').evaluateAll(
    (rows) => rows.map((row) => Number(row.getAttribute('data-seq')))
  )
  await feed.getByRole('button', { name: '加载更早活动' }).click()
  await expect.poll(() => feed.locator('.activity-row').count()).toBeGreaterThan(20)
  const expandedSeqs = await feed.locator('.activity-row').evaluateAll(
    (rows) => rows.map((row) => Number(row.getAttribute('data-seq')))
  )
  expect(new Set(expandedSeqs).size).toBe(expandedSeqs.length)
  expect(Math.min(...expandedSeqs)).toBeLessThan(Math.min(...initialSeqs))

  await window.getByRole('button', { name: 'Need You' }).click()
  await expect(window.locator('.need-you-card')).toHaveCount(40)
  await window.getByRole('button', { name: 'Runtime' }).click()
  await expect(window.locator('.runtime-center')).toBeVisible()
  await window.getByRole('button', { name: '刷新运行时状态' }).click()
  await expect(window.getByRole('button', { name: '刷新运行时状态' })).toBeEnabled()
  await expect(
    window.locator('[aria-labelledby="runtime-mcp-heading"] .runtime-resource-card')
  ).toHaveCount(MCP_COUNT)

  const heapBaseline = await getHeapUsed(window, app)
  for (let cycle = 0; cycle < 4; cycle += 1) {
    await navigateAndWait(window, 'Agent', '.agent-card', AGENT_COUNT)
    await navigateAndWait(window, 'Automations', '.automation-card', SCHEDULE_COUNT)
    await navigateAndWait(window, 'Need You', '.need-you-card', 40)
    await navigateAndWait(window, 'Runtime', '.runtime-center')
    await window.getByRole('button', { name: '刷新运行时状态' }).click()
    await expect(window.getByRole('button', { name: '刷新运行时状态' })).toBeEnabled()
    await navigateAndWait(window, 'Tasks', '.virtual-task-list')
  }
  const heapMidpoint = await getHeapUsed(window, app)

  for (let cycle = 0; cycle < 4; cycle += 1) {
    await navigateAndWait(window, 'Agent', '.agent-card', AGENT_COUNT)
    await navigateAndWait(window, 'Automations', '.automation-card', SCHEDULE_COUNT)
    await navigateAndWait(window, 'Need You', '.need-you-card', 40)
    await navigateAndWait(window, 'Runtime', '.runtime-center')
    await window.getByRole('button', { name: '刷新运行时状态' }).click()
    await expect(window.getByRole('button', { name: '刷新运行时状态' })).toBeEnabled()
    await navigateAndWait(window, 'Tasks', '.virtual-task-list')
  }
  const heapFinal = await getHeapUsed(window, app)
  const allowedGrowth = Math.max(32 * MB, heapBaseline * 0.4)
  expect(heapFinal - heapBaseline).toBeLessThan(allowedGrowth)
  expect(heapFinal - heapMidpoint).toBeLessThan(24 * MB)

  const results: PerformanceResults = {
    taskHydrationMs,
    agentPageMs,
    automationPageMs,
    listTasksRpcMs: rpcMeasurements.listTasks.durationMs,
    listTasksBytes: rpcMeasurements.listTasksBytes,
    getTaskRpcMs: rpcMeasurements.getTask.durationMs,
    needYouRpcMs: rpcMeasurements.needYou.durationMs,
    recentActivityRpcMs: rpcMeasurements.recent.durationMs,
    olderActivityRpcMs: rpcMeasurements.older.durationMs,
    runtimeRpcMs: rpcMeasurements.runtime.map((result) => result.durationMs),
    heapBaselineMb: heapBaseline / MB,
    heapMidpointMb: heapMidpoint / MB,
    heapFinalMb: heapFinal / MB
  }
  process.stdout.write(`[phase2-performance] ${JSON.stringify(results)}\n`)
  expect(rendererErrors).toEqual([])
})
