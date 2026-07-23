import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import type { RuntimeOverviewView } from '../../src/shared/types'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('Runtime Overview：千任务七日聚合保持快速且不泄漏正文、路径或密钥', async () => {
  launched = await launchApp()
  const { window, dataDir } = launched
  const now = new Date()
  const recent = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const old = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
  const future = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const secret = 'sk-private-overview /Users/private/customer.txt prompt artifact content'
  const sql = `
    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 1002
    )
    INSERT INTO tasks (id, goal, input_path, recipe_id, status, created_at, updated_at)
    SELECT
      printf('overview-task-%04d', x),
      CASE WHEN x = 1 THEN '${secret}' ELSE 'overview load task' END,
      CASE WHEN x = 1 THEN '/Users/private/input.md' ELSE '/tmp/input.md' END,
      'file-edit-summarize',
      'delivered',
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 1002
    )
    INSERT INTO runs (id, task_id, recipe_id, status, current_step_index, started_at, ended_at)
    SELECT
      printf('overview-run-%04d', x),
      printf('overview-task-%04d', x),
      'file-edit-summarize',
      'delivered',
      1,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 1002
    )
    INSERT INTO steps (id, run_id, idx, name, title, kind, status, attempt, started_at, ended_at)
    SELECT
      printf('overview-step-%04d', x),
      printf('overview-run-%04d', x),
      0,
      'overview',
      'Overview',
      'model',
      'completed',
      1,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 1002
    )
    INSERT INTO model_calls
      (id, step_id, model, input_chars, output_chars, tokens_in, tokens_out, cost_usd, status, error, created_at)
    SELECT
      printf('overview-model-%04d', x),
      printf('overview-step-%04d', x),
      'overview-model',
      10,
      10,
      2,
      3,
      0.01,
      CASE WHEN x = 1 THEN 'error' ELSE 'ok' END,
      CASE WHEN x = 1 THEN '${secret}' ELSE NULL END,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END
    FROM n;

    WITH RECURSIVE n(x) AS (
      SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 1002
    )
    INSERT INTO tool_calls
      (id, step_id, tool_id, tool_version, input_json, status, risk_level, retry_count, error, started_at, ended_at)
    SELECT
      printf('overview-tool-%04d', x),
      printf('overview-step-%04d', x),
      'fs.read',
      '1.0.0',
      CASE WHEN x = 1 THEN '{"secret":"${secret}"}' ELSE '{}' END,
      CASE WHEN x = 1 THEN 'error' ELSE 'ok' END,
      'low',
      0,
      CASE WHEN x = 1 THEN '${secret}' ELSE NULL END,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END,
      CASE WHEN x = 1001 THEN '${old}' WHEN x = 1002 THEN '${future}' ELSE '${recent}' END
    FROM n;

    INSERT INTO artifacts
      (id, task_id, run_id, step_id, type, title, content, verification_status, is_deliverable, created_at)
    VALUES
      ('overview-secret-artifact', 'overview-task-0001', 'overview-run-0001',
       'overview-step-0001', 'text/plain', 'private', '${secret}', 'passed', 0, '${recent}');
  `
  execFileSync('/usr/bin/sqlite3', [join(dataDir, 'leanclaw.db'), sql])

  const result = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const started = performance.now()
    const overview = (await api.rpc({ method: 'getRuntimeOverview' })) as RuntimeOverviewView
    return { overview, durationMs: performance.now() - started }
  })

  expect(result.overview.overall).toBe('degraded')
  expect(result.overview.runtime).toMatchObject({
    state: 'ready',
    activeTasks: 0,
    queuedTasks: 0,
    maxActiveTasks: 3
  })
  expect(Date.parse(result.overview.runtime.startedAt ?? '')).not.toBeNaN()
  expect(result.overview.usage7d).toMatchObject({
    runs: 1000,
    modelCalls: 1000,
    toolCalls: 1000,
    tokensIn: 2000,
    tokensOut: 3000
  })
  expect(result.overview.usage7d.costUsd).toBeCloseTo(10, 8)
  expect(result.overview.providers).toEqual([])
  expect(result.overview.mcp).toEqual([])
  expect(result.overview.shell).toEqual({
    enabled: false,
    allowPrefixCount: 0,
    risk: 'forbidden'
  })
  expect(result.durationMs).toBeLessThan(1500)
  const json = JSON.stringify(result.overview)
  expect(json).not.toContain(secret)
  expect(json).not.toContain('/Users/private')
  expect(json).not.toContain('prompt')
  expect(json).not.toContain('artifact content')
  const cacheJson = readFileSync(join(dataDir, 'runtime-overview-usage.json'), 'utf8')
  expect(JSON.parse(cacheJson)).toEqual({ usage7d: result.overview.usage7d })
  expect(cacheJson).not.toContain(secret)
})

test('Runtime Overview：Runtime 进程退出后 Main 在超时内返回安全 offline', async () => {
  launched = await launchApp()
  const { app, window } = launched
  const beforeExit = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const defaults = (await api.rpc({ method: 'getDefaults' })) as { samplePath: string }
    const task = (await api.rpc({
      method: 'createTask',
      goal: '缓存 Runtime Overview 历史用量',
      inputPath: defaults.samplePath
    })) as { id: string }
    await api.rpc({ method: 'startTask', taskId: task.id })
    return (await api.rpc({ method: 'getRuntimeOverview' })) as RuntimeOverviewView
  })
  expect(beforeExit.usage7d.runs).toBe(1)

  const runtimePid = await app.evaluate(({ app: electronApp }) => {
    return electronApp
      .getAppMetrics()
      .find((metric) => metric.type === 'Utility' && metric.name === 'leanclaw-runtime')?.pid
  })
  expect(runtimePid).toBeTruthy()

  process.kill(runtimePid as number, 'SIGKILL')

  let offline: RuntimeOverviewView | null = null
  await expect
    .poll(
      async () => {
        offline = await window.evaluate(async () => {
          const api = (
            globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
          ).api
          return (await api.rpc({
            method: 'getRuntimeOverview'
          })) as RuntimeOverviewView
        })
        return offline.overall
      },
      { timeout: 5000 }
    )
    .toBe('offline')
  expect(offline).toMatchObject({
    runtime: {
      state: 'offline',
      startedAt: null,
      activeTasks: 0,
      queuedTasks: 0,
      maxActiveTasks: beforeExit.runtime.maxActiveTasks
    },
    providers: beforeExit.providers,
    shell: beforeExit.shell,
    usage7d: beforeExit.usage7d
  })
})

test('Runtime Overview：Runtime 无响应时超时回退且恢复后 pending 不污染新请求', async () => {
  launched = await launchApp()
  const { app, window } = launched
  const initial = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    return (await api.rpc({ method: 'getRuntimeOverview' })) as RuntimeOverviewView
  })
  const runtimePid = await app.evaluate(({ app: electronApp }) => {
    return electronApp
      .getAppMetrics()
      .find((metric) => metric.type === 'Utility' && metric.name === 'leanclaw-runtime')?.pid
  })
  expect(runtimePid).toBeTruthy()

  process.kill(runtimePid as number, 'SIGSTOP')
  try {
    const timedOut = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
      ).api
      const started = performance.now()
      const overview = (await api.rpc({
        method: 'getRuntimeOverview'
      })) as RuntimeOverviewView
      return { overview, durationMs: performance.now() - started }
    })
    expect(timedOut.durationMs).toBeGreaterThanOrEqual(2800)
    expect(timedOut.durationMs).toBeLessThan(5000)
    expect(timedOut.overview.overall).toBe('offline')
    expect(timedOut.overview.usage7d).toEqual(initial.usage7d)
  } finally {
    process.kill(runtimePid as number, 'SIGCONT')
  }

  await expect
    .poll(
      async () => {
        return window.evaluate(async () => {
          const api = (
            globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
          ).api
          const overview = (await api.rpc({
            method: 'getRuntimeOverview'
          })) as RuntimeOverviewView
          return overview.overall
        })
      },
      { timeout: 5000 }
    )
    .toBe('degraded')
})

test('Runtime Overview：冷启动首次 RPC 前离线仍从安全缓存保留历史用量', async () => {
  launched = await launchApp()
  let { app, window, dataDir } = launched
  const cached = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const defaults = (await api.rpc({ method: 'getDefaults' })) as { samplePath: string }
    const task = (await api.rpc({
      method: 'createTask',
      goal: '持久化安全 Runtime 用量',
      inputPath: defaults.samplePath
    })) as { id: string }
    await api.rpc({ method: 'startTask', taskId: task.id })
    return (await api.rpc({ method: 'getRuntimeOverview' })) as RuntimeOverviewView
  })
  expect(cached.usage7d.runs).toBe(1)

  await app.close()
  launched = await launchApp({}, dataDir)
  ;({ app, window, dataDir } = launched)
  const runtimePid = await app.evaluate(({ app: electronApp }) => {
    return electronApp
      .getAppMetrics()
      .find((metric) => metric.type === 'Utility' && metric.name === 'leanclaw-runtime')?.pid
  })
  expect(runtimePid).toBeTruthy()
  process.kill(runtimePid as number, 'SIGKILL')

  await expect
    .poll(
      async () => {
        return window.evaluate(async () => {
          const api = (
            globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
          ).api
          return (await api.rpc({
            method: 'getRuntimeOverview'
          })) as RuntimeOverviewView
        })
      },
      { timeout: 5000 }
    )
    .toMatchObject({
      overall: 'offline',
      usage7d: cached.usage7d
    })
})
