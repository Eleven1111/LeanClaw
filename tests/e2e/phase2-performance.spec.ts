import { execFileSync } from 'child_process'
import { join } from 'path'
import { expect, test, type Page } from '@playwright/test'
import type {
  ActivityView,
  NeedYouItemView,
  RuntimeOverviewView
} from '../../src/shared/types'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

const TASK_COUNT = 1_000
const AGENT_COUNT = 100
const EVENTS_PER_TASK = 200
const SCHEDULE_COUNT = 50
const MCP_COUNT = 20
const MB = 1024 * 1024

interface PerformanceResults {
  taskHydrationMs: number
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

    WITH RECURSIVE n(x) AS (
      SELECT 21 UNION ALL SELECT x + 1 FROM n WHERE x < 30
    )
    INSERT INTO runs
      (id, task_id, recipe_id, status, current_step_index, started_at, ended_at)
    SELECT
      printf('perf-run-%04d', x),
      printf('perf-task-%04d', x),
      'file-edit-summarize',
      'failed',
      0,
      '2026-07-23T12:00:00.000Z',
      '2026-07-23T12:00:01.000Z'
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
  expect(taskHydrationMs).toBeLessThan(60_000)

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
    return { needYou, recent, older, runtime }
  })

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
