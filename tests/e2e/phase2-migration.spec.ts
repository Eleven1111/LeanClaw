import { execFileSync } from 'child_process'
import { join } from 'path'
import { expect, test, type Page } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

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

function seedAndDowngradeToV8(dbPath: string): void {
  sqlite(
    dbPath,
    `
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;

    INSERT INTO tasks
      (id, project_id, goal, brief, input_path, recipe_id, status, created_at, updated_at,
       budget_usd, refine_instructions, project_instructions_snapshot, schedule_id)
    VALUES
      ('legacy-task', NULL, 'v8 旧任务迁移验证', '旧 Task Brief', '',
       'file-edit-summarize', 'delivered', '2026-07-01T08:00:00.000Z',
       '2026-07-01T08:03:00.000Z', 1.5, NULL, NULL, 'legacy-schedule');

    INSERT INTO runs
      (id, task_id, recipe_id, status, current_step_index, resume_step_index,
       started_at, ended_at)
    VALUES
      ('legacy-run', 'legacy-task', 'file-edit-summarize', 'delivered', 0, NULL,
       '2026-07-01T08:00:00.000Z', '2026-07-01T08:03:00.000Z');

    INSERT INTO steps
      (id, run_id, idx, name, title, kind, status, attempt, output_summary,
       started_at, ended_at)
    VALUES
      ('legacy-step', 'legacy-run', 0, 'read_input', '读取输入', 'model', 'done', 1,
       '已读取旧输入', '2026-07-01T08:00:00.000Z', '2026-07-01T08:01:00.000Z');

    INSERT INTO artifacts
      (id, task_id, run_id, step_id, type, title, version, content, local_path,
       mime_type, producer, source_artifact_ids, hash, verification_status,
       is_deliverable, superseded_by, created_at, origin)
    VALUES
      ('legacy-artifact', 'legacy-task', 'legacy-run', 'legacy-step', 'report',
       'v8 旧交付物', 1, 'legacy artifact body', NULL, 'text/markdown', 'legacy',
       NULL, 'legacy-hash', 'verified', 1, NULL, '2026-07-01T08:02:00.000Z',
       'legacy');

    INSERT INTO evidence
      (id, task_id, artifact_id, source_type, locator, excerpt, verification_status,
       created_at)
    VALUES
      ('legacy-evidence', 'legacy-task', 'legacy-artifact', 'file', 'legacy://source',
       'legacy excerpt', 'verified', '2026-07-01T08:02:30.000Z');

    INSERT INTO run_events
      (task_id, run_id, step_id, type, payload, created_at)
    VALUES
      ('legacy-task', 'legacy-run', NULL, 'delivered', '{"artifactCount":1}',
       '2026-07-01T08:03:00.000Z');

    INSERT INTO run_events_archive
      (original_seq, task_id, run_id, step_id, type, payload, created_at, archived_at)
    VALUES
      (9001, 'legacy-task', 'legacy-run', 'legacy-step', 'step-completed',
       '{"name":"read_input"}', '2026-07-01T08:01:00.000Z',
       '2026-07-01T08:04:00.000Z');

    INSERT INTO schedules
      (id, name, goal, input_path, recipe_id, project_id, budget_usd, cadence,
       time_of_day, day_of_week, next_run_at, last_triggered_at, enabled,
       created_at, updated_at)
    VALUES
      ('legacy-schedule', 'v8 旧自动化', '定期验证旧数据', '', 'file-edit-summarize',
       NULL, 1.5, 'daily', '08:00', NULL, '2099-01-01T00:00:00.000Z', NULL, 1,
       '2026-07-01T07:00:00.000Z', '2026-07-01T07:00:00.000Z');

    CREATE TABLE tasks_v8 (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      goal TEXT NOT NULL,
      brief TEXT,
      input_path TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      budget_usd REAL,
      refine_instructions TEXT,
      project_instructions_snapshot TEXT,
      schedule_id TEXT
    );
    INSERT INTO tasks_v8
      SELECT id, project_id, goal, brief, input_path, recipe_id, status, created_at,
             updated_at, budget_usd, refine_instructions, project_instructions_snapshot,
             schedule_id
      FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_v8 RENAME TO tasks;

    CREATE TABLE schedules_v8 (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT NOT NULL,
      input_path TEXT NOT NULL DEFAULT '',
      recipe_id TEXT NOT NULL,
      project_id TEXT,
      budget_usd REAL,
      cadence TEXT NOT NULL,
      time_of_day TEXT NOT NULL,
      day_of_week INTEGER,
      next_run_at TEXT NOT NULL,
      last_triggered_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO schedules_v8
      SELECT id, name, goal, input_path, recipe_id, project_id, budget_usd, cadence,
             time_of_day, day_of_week, next_run_at, last_triggered_at, enabled,
             created_at, updated_at
      FROM schedules;
    DROP TABLE schedules;
    ALTER TABLE schedules_v8 RENAME TO schedules;

    CREATE TABLE run_events_v8 (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_id TEXT,
      step_id TEXT,
      type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO run_events_v8
      (seq, task_id, run_id, step_id, type, payload, created_at)
      SELECT seq, task_id, run_id, step_id, type, payload, created_at FROM run_events;
    DROP TABLE run_events;
    ALTER TABLE run_events_v8 RENAME TO run_events;

    CREATE TABLE run_events_archive_v8 (
      original_seq INTEGER PRIMARY KEY,
      task_id TEXT NOT NULL,
      run_id TEXT,
      step_id TEXT,
      type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL,
      archived_at TEXT NOT NULL
    );
    INSERT INTO run_events_archive_v8
      SELECT original_seq, task_id, run_id, step_id, type, payload, created_at,
             archived_at
      FROM run_events_archive;
    DROP TABLE run_events_archive;
    ALTER TABLE run_events_archive_v8 RENAME TO run_events_archive;

    DROP TABLE agents;
    UPDATE schema_version SET version = 8;
    COMMIT;
    `
  )
}

function legacyCounts(dbPath: string): Record<string, number> {
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
       (SELECT COUNT(*) FROM schedules) AS schedules`
  )
  return row
}

test('Phase 2 旅程 E：真实 v8 数据升级到 v12 后兼容、可归档并可重启', async () => {
  test.setTimeout(90_000)
  const rendererErrors: string[] = []

  launched = await launchApp()
  let { app, window, dataDir } = launched
  watchRendererErrors(window, rendererErrors)
  const dbPath = join(dataDir, 'leanclaw.db')

  await app.close()
  seedAndDowngradeToV8(dbPath)
  const before = legacyCounts(dbPath)
  expect(before).toEqual({
    tasks: 1,
    runs: 1,
    steps: 1,
    artifacts: 1,
    evidence: 1,
    run_events: 1,
    run_events_archive: 1,
    schedules: 1
  })

  launched = await launchApp({}, dataDir)
  ;({ app, window, dataDir } = launched)
  watchRendererErrors(window, rendererErrors)

  expect(legacyCounts(dbPath)).toEqual(before)
  const [migration] = sqliteJson<
    Array<{
      version: number
      agents: number
      taskAgentId: string | null
      taskAgentName: string | null
      taskAgentInstructions: string | null
      triggerSource: string | null
      scheduleAgentId: string | null
      eventActorType: string | null
      eventActorId: string | null
      eventActorName: string | null
    }>
  >(
    dbPath,
    `SELECT
       (SELECT version FROM schema_version LIMIT 1) AS version,
       (SELECT COUNT(*) FROM agents) AS agents,
       (SELECT agent_id FROM tasks WHERE id = 'legacy-task') AS taskAgentId,
       (SELECT agent_name_snapshot FROM tasks WHERE id = 'legacy-task') AS taskAgentName,
       (SELECT agent_instructions_snapshot FROM tasks WHERE id = 'legacy-task')
         AS taskAgentInstructions,
       (SELECT schedule_trigger_source FROM tasks WHERE id = 'legacy-task')
         AS triggerSource,
       (SELECT agent_id FROM schedules WHERE id = 'legacy-schedule') AS scheduleAgentId,
       (SELECT actor_type FROM run_events WHERE task_id = 'legacy-task' LIMIT 1)
         AS eventActorType,
       (SELECT actor_id FROM run_events WHERE task_id = 'legacy-task' LIMIT 1)
         AS eventActorId,
       (SELECT actor_name_snapshot FROM run_events WHERE task_id = 'legacy-task' LIMIT 1)
         AS eventActorName`
  )
  expect(migration).toEqual({
    version: 12,
    agents: 0,
    taskAgentId: null,
    taskAgentName: null,
    taskAgentInstructions: null,
    triggerSource: null,
    scheduleAgentId: null,
    eventActorType: null,
    eventActorId: null,
    eventActorName: null
  })

  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('button', { name: '看板' }).click()
  const legacyCard = window.locator('.kanban-card', { hasText: 'v8 旧任务迁移验证' })
  await expect(legacyCard).toContainText('默认执行器')
  await legacyCard.click()
  await expect(window.getByRole('heading', { name: 'Activity' })).toBeVisible()

  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    await api.rpc({ method: 'archiveTask', taskId: 'legacy-task' })
  })
  const activity = window.locator('.task-activity-feed')
  await expect(activity).toContainText('历史活动已压缩')
  await expect(activity).toContainText('原始明细已按数据治理规则归档')
  await expect(activity.locator('.activity-row')).toHaveCount(1)

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await window.getByRole('button', { name: '创建 Agent' }).click()
  await window.getByLabel('Agent 名称').fill('Migration Agent')
  await window.getByLabel('用途说明').fill('验证 v8 升级后新数据可写')
  await window.getByLabel('稳定指令').fill('保持旧数据兼容并生成可验证交付。')
  await window.getByLabel('默认 Recipe').selectOption('file-edit-summarize')
  await window.getByLabel('默认预算').fill('1.25')
  await window.getByLabel('最大并发').selectOption('1')
  await window.getByRole('button', { name: '保存 Agent' }).click()

  const agentCard = window.locator('.agent-card', { hasText: 'Migration Agent' })
  await expect(agentCard).toBeVisible()
  await agentCard.getByRole('button', { name: '用它发起任务' }).click()
  await expect(window.getByLabel('Recipe')).toHaveValue('file-edit-summarize')
  await expect(window.getByLabel('预算 USD（可选）')).toHaveValue('1.25')
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30_000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({
    timeout: 30_000
  })
  await expect(window.locator('.chip-agent')).toContainText('Migration Agent')

  await app.close()
  launched = await launchApp({}, dataDir)
  ;({ app, window, dataDir } = launched)
  watchRendererErrors(window, rendererErrors)

  expect(sqlite(dbPath, 'SELECT version FROM schema_version LIMIT 1')).toBe('12')
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.locator('.filter-chip', { hasText: 'Archived' }).click()
  await window
    .locator('.task-row', { hasText: 'v8 旧任务迁移验证' })
    .locator('.task-row-main')
    .click()
  await expect(window.locator('.task-activity-feed')).toContainText('历史活动已压缩')
  await expect(window.locator('.task-activity-feed .activity-row')).toHaveCount(1)
  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await expect(window.locator('.agent-card', { hasText: 'Migration Agent' })).toBeVisible()
  expect(rendererErrors).toEqual([])
})
