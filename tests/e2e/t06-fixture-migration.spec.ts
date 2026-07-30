// T06：用可追溯的 v8 old-binary fixture 证明开发态旧库升级。
//
// 与 phase2-migration.spec.ts 的区别：那条用例先用当前 v13 应用建库、再手工把四张表降级到
// v8，因此降格前的部分 v13 索引会残留，不能独立证明 v13 迁移创建了全部索引。
// 本用例的数据库由锚点提交 15831e5 自己的 `initDb()` 创建（见 fixture manifest），
// 应用第一次接触它就是 v8，索引、未知对象和历史数据都来自旧库。
//
// 边界：这仍是开发态迁移（`out/main/index.js`），不是 packaged migration；最终 `.app` 的
// 旧库升级属于 T08。
import { execFileSync } from 'child_process'
import { copyFileSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, test, type Page } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/migrations/v8-old-binary')

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

function sqlite(dbPath: string, sql: string): string {
  return execFileSync('/usr/bin/sqlite3', [dbPath, sql], { encoding: 'utf8' }).trim()
}

function sqliteJson<T>(dbPath: string, sql: string): T {
  return JSON.parse(
    execFileSync('/usr/bin/sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' })
  ) as T
}

function watchRendererErrors(window: Page, errors: string[]): void {
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  window.on('pageerror', (error) => errors.push(error.message))
}

function counts(dbPath: string): Record<string, number> {
  const [row] = sqliteJson<Array<Record<string, number>>>(
    dbPath,
    `SELECT
       (SELECT COUNT(*) FROM tasks) AS tasks,
       (SELECT COUNT(*) FROM runs) AS runs,
       (SELECT COUNT(*) FROM steps) AS steps,
       (SELECT COUNT(*) FROM artifacts) AS artifacts,
       (SELECT COUNT(*) FROM evidence) AS evidence,
       (SELECT COUNT(*) FROM run_events) AS run_events,
       (SELECT COUNT(*) FROM run_events_archive) AS run_events_archive,
       (SELECT COUNT(*) FROM schedules) AS schedules,
       (SELECT COUNT(*) FROM legacy_task_audit) AS legacy_task_audit`
  )
  return row
}

function objectNames(dbPath: string): string {
  return sqlite(
    dbPath,
    `SELECT group_concat(name, ',') FROM (
       SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name
     )`
  )
}

test('T06：old-binary v8 fixture 在开发态升级到 v13 并保留未知对象与主路径', async () => {
  test.setTimeout(120_000)
  const rendererErrors: string[] = []

  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8')) as {
    source_kind: string
    schema_version: number
  }
  expect(manifest.source_kind).toBe('synthetic-old-binary')
  expect(manifest.schema_version).toBe(8)

  const dataDir = mkdtempSync(join(tmpdir(), 'leanclaw-t06-fixture-'))
  const dbPath = join(dataDir, 'leanclaw.db')
  copyFileSync(join(FIXTURE_DIR, 'leanclaw.db'), dbPath)

  expect(sqlite(dbPath, 'SELECT version FROM schema_version')).toBe('8')
  const before = counts(dbPath)
  expect(before).toEqual({
    tasks: 1,
    runs: 1,
    steps: 1,
    artifacts: 1,
    evidence: 1,
    run_events: 1,
    run_events_archive: 1,
    schedules: 1,
    legacy_task_audit: 1
  })
  // 旧库里没有任何 v13 索引，因此升级后出现的索引只能来自 v13 迁移
  expect(sqlite(dbPath, "SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'idx_%'")).toBe('1')
  const unknownBefore = sqliteJson<Array<{ name: string; sql: string }>>(
    dbPath,
    `SELECT name, sql FROM sqlite_master
     WHERE name IN ('legacy_task_audit','idx_legacy_manual_task_created','trg_legacy_task_audit')
     ORDER BY name`
  )
  expect(unknownBefore).toHaveLength(3)

  launched = await launchApp({}, dataDir)
  let { app, window } = launched
  watchRendererErrors(window, rendererErrors)

  expect(sqlite(dbPath, 'SELECT version FROM schema_version')).toBe('13')
  expect(counts(dbPath)).toEqual(before)
  for (const index of [
    'idx_run_events_task',
    'idx_run_events_archive_task',
    'idx_runs_task',
    'idx_approvals_task',
    'idx_andon_events_task',
    'idx_artifacts_task',
    'idx_evidence_task',
    'idx_verifications_run',
    'idx_model_calls_step',
    'idx_tool_calls_step',
    'idx_tasks_agent',
    'idx_tasks_schedule',
    'idx_schedules_agent'
  ]) {
    expect(objectNames(dbPath)).toContain(index)
  }
  expect(
    sqlite(
      dbPath,
      `EXPLAIN QUERY PLAN SELECT COUNT(*) FROM run_events WHERE task_id = 'legacy-task'`
    )
  ).toContain('idx_run_events_task')
  expect(
    sqliteJson(
      dbPath,
      `SELECT name, sql FROM sqlite_master
       WHERE name IN ('legacy_task_audit','idx_legacy_manual_task_created','trg_legacy_task_audit')
       ORDER BY name`
    )
  ).toEqual(unknownBefore)

  // 旧 Task 在 UI 里可读，且新增字段保持“不伪造历史”的 NULL 语义
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.locator('.filter-chip', { hasText: 'Delivered' }).click()
  await expect(window.locator('.task-row', { hasText: 'v8 旧任务迁移验证' })).toBeVisible({
    timeout: 15_000
  })

  // 迁移后的真实 Task 主路径：新建 → 批准 → 交付
  await window.getByRole('button', { name: 'Home' }).click()
  const startButton = window.getByRole('button', { name: '开始任务' })
  await expect(startButton).toBeEnabled({ timeout: 15_000 })
  const goalText = await window.locator('.input-card textarea').inputValue()
  await startButton.click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30_000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({
    timeout: 30_000
  })

  // 重启：版本、旧数据与未知对象都不得被第二次启动改坏
  await app.close()
  launched = await launchApp({}, dataDir)
  ;({ app, window } = launched)
  watchRendererErrors(window, rendererErrors)

  expect(sqlite(dbPath, 'SELECT version FROM schema_version')).toBe('13')
  expect(counts(dbPath).tasks).toBe(2)
  // 未知触发器不只是“还在”，它在升级后仍然生效：旧行不动，新 Task 的更新被它记录下来
  expect(
    sqlite(dbPath, `SELECT COUNT(*) FROM legacy_task_audit WHERE task_id = 'legacy-task'`)
  ).toBe(String(before.legacy_task_audit))
  expect(Number(sqlite(dbPath, 'SELECT COUNT(*) FROM legacy_task_audit'))).toBeGreaterThan(
    before.legacy_task_audit
  )
  expect(
    sqliteJson(
      dbPath,
      `SELECT name, sql FROM sqlite_master
       WHERE name IN ('legacy_task_audit','idx_legacy_manual_task_created','trg_legacy_task_audit')
       ORDER BY name`
    )
  ).toEqual(unknownBefore)

  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.locator('.filter-chip', { hasText: 'Delivered' }).click()
  await expect(window.locator('.task-row', { hasText: 'v8 旧任务迁移验证' })).toBeVisible({
    timeout: 15_000
  })
  await expect(window.locator('.task-row', { hasText: goalText })).toBeVisible({ timeout: 15_000 })
  expect(rendererErrors).toEqual([])
})
