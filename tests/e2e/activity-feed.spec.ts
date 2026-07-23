import { execFileSync } from 'child_process'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('Task Activity：actor 快照、分页、窄跳转与归档摘要', async () => {
  launched = await launchApp()
  const { app, window, dataDir } = launched
  const rendererErrors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  window.on('pageerror', (error) => rendererErrors.push(error.message))

  const seeded = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const defaults = (await api.rpc({ method: 'getDefaults' })) as { samplePath: string }
    const agent = (await api.rpc({
      method: 'saveAgent',
      name: 'Feed Agent V1',
      description: 'Activity actor 快照',
      instructions: '保持活动可审计',
      defaultRecipeId: 'file-edit-summarize',
      defaultBudgetUsd: 2,
      maxConcurrentRuns: 1
    })) as { id: string }
    const task = (await api.rpc({
      method: 'createTask',
      goal: '验证 Task Activity Feed',
      inputPath: defaults.samplePath,
      agentId: agent.id
    })) as { id: string }
    await api.rpc({ method: 'startTask', taskId: task.id })
    return { agentId: agent.id, taskId: task.id }
  })

  await window.getByRole('button', { name: 'Tasks' }).click()
  await window
    .locator('.task-row', { hasText: '验证 Task Activity Feed' })
    .locator('.task-row-main')
    .click()
  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30_000 })

  const feed = window.locator('.task-activity-feed')
  await expect(feed.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(feed).toContainText('Feed Agent V1请求你批准动作')
  await feed.locator('button.activity-row[data-target="approval"]').click()
  await expect(window.locator('#approval-card')).toBeFocused()

  await window.evaluate(async (agentId) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    await api.rpc({
      method: 'saveAgent',
      id: agentId,
      name: 'Feed Agent V2',
      description: '已改名',
      instructions: '新指令',
      defaultRecipeId: 'file-edit-summarize',
      defaultBudgetUsd: 2,
      maxConcurrentRuns: 1
    })
  }, seeded.agentId)
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({
    timeout: 30_000
  })
  await expect(feed).toContainText('交付物已生成')
  await expect(feed).toContainText('Feed Agent V1')
  await expect(feed).not.toContainText('Feed Agent V2')
  await feed.locator('button.activity-row[data-target="approval"]').last().click()
  await expect(window.getByRole('heading', { name: 'Run Inspector' })).toBeVisible()
  await window.getByRole('button', { name: '回到任务' }).click()

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900)
  })
  await window.waitForTimeout(300)
  mkdirSync('.omx/state/task-activity', { recursive: true })
  await feed.scrollIntoViewIfNeeded()
  await feed.locator('.activity-list-scroll').evaluate((element) => {
    element.scrollTop = 0
  })
  await feed.screenshot({ path: '.omx/state/task-activity/feed-delivered.png' })

  execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `WITH RECURSIVE n(x) AS (
       SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 25
     )
     INSERT INTO run_events
       (task_id, type, payload, actor_type, actor_name_snapshot, created_at)
     SELECT '${seeded.taskId}', 'brief-edited', '{}', 'user', '你',
            '2026-07-23T21:00:00.000Z'
     FROM n`
  ])
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window
    .locator('.task-row', { hasText: '验证 Task Activity Feed' })
    .locator('.task-row-main')
    .click()

  const initialSeqs = await feed
    .locator('.activity-row')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-seq')))
  expect(initialSeqs.length).toBeLessThanOrEqual(20)
  const loadEarlier = feed.getByRole('button', { name: '加载更早活动' })
  await expect(loadEarlier).toBeVisible()
  await loadEarlier.click()
  await expect
    .poll(() => feed.locator('.activity-row').count())
    .toBeGreaterThan(initialSeqs.length)
  const expandedSeqs = await feed
    .locator('.activity-row')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-seq')))
  expect(new Set(expandedSeqs).size).toBe(expandedSeqs.length)
  await expect(feed.locator('.activity-title', { hasText: '你更新了 Brief' })).toHaveCount(25)
  const stepActivity = feed.locator('button.activity-row[data-target="step"]').first()
  await expect(stepActivity).toBeVisible()
  await stepActivity.click()
  await expect(window.getByRole('heading', { name: 'Run Inspector' })).toBeVisible()
  await expect(window.locator('.run-step-detail')).toBeVisible()
  await window.getByRole('button', { name: '回到任务' }).click()

  await window.evaluate(async (taskId) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    await api.rpc({ method: 'archiveTask', taskId })
  }, seeded.taskId)
  await expect(feed).toContainText('历史活动已压缩')
  await expect(feed).toContainText('原始明细已按数据治理规则归档')
  await expect(feed.locator('.activity-row')).toHaveCount(1)

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900)
  })
  await window.waitForTimeout(300)
  await feed.scrollIntoViewIfNeeded()
  await feed.screenshot({ path: '.omx/state/task-activity/feed-archived.png' })
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(900, 600)
  })
  await window.waitForTimeout(300)
  expect(
    await window.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false)
  expect(rendererErrors).toEqual([])
})

test('Task Activity：预算停线说明等待原因和下一步', async () => {
  launched = await launchApp({ LEANCLAW_FAULT: 'expensive_model' })
  const { window } = launched
  const rendererErrors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  window.on('pageerror', (error) => rendererErrors.push(error.message))

  await window.getByLabel('Recipe').selectOption('content-pack')
  await window.getByLabel('预算 USD（可选）').fill('0.05')
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('#andon-card')).toContainText('预算已用尽', {
    timeout: 30_000
  })
  const feed = window.locator('.task-activity-feed')
  await expect(feed).toContainText('预算不足，任务已停线')
  await expect(feed).toContainText('任务需要处理')
  await expect(window.getByPlaceholder('追加预算 USD')).toBeVisible()
  await window.getByRole('button', { name: '取消任务' }).click()
  await expect(window.locator('.chip-gray', { hasText: 'Cancelled' })).toBeVisible()
  expect(rendererErrors).toEqual([])
})
