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

test('Agent 身份贯穿 Task 快照、列表、看板与定时计划', async () => {
  launched = await launchApp()
  const { window, dataDir } = launched
  const rendererErrors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  window.on('pageerror', (error) => rendererErrors.push(error.message))

  const agentId = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const agent = await api.rpc({
      method: 'saveAgent',
      name: 'Snapshot Agent V1',
      description: '验证任务身份快照',
      instructions: 'AGENT_INSTRUCTIONS_V1 <必须隔离>',
      defaultRecipeId: 'content-pack',
      defaultBudgetUsd: 3,
      maxConcurrentRuns: 1
    }) as { id: string }
    return agent.id
  })

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await window.getByRole('button', { name: 'Home' }).click()
  await window.getByLabel('Agent').selectOption(agentId)
  await expect(window.getByLabel('Recipe')).toHaveValue('content-pack')
  await expect(window.getByLabel('预算 USD（可选）')).toHaveValue('3')

  const goal = '验证 Agent 创建快照与用户覆盖'
  await window.getByLabel('Recipe').selectOption('deep-research')
  await window.getByLabel('预算 USD（可选）').fill('1.25')
  await window.locator('.input-card textarea').fill(goal)
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('.chip-agent')).toHaveText('Agent · Snapshot Agent V1')

  const task = await window.evaluate(async (taskGoal) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const tasks = await api.rpc({ method: 'listTasks' }) as {
      id: string
      goal: string
      agentId: string | null
      agentName: string | null
      recipeId: string
      budgetUsd: number | null
    }[]
    return tasks.find((item) => item.goal === taskGoal)
  }, goal)
  expect(task).toMatchObject({
    agentId,
    agentName: 'Snapshot Agent V1',
    recipeId: 'deep-research',
    budgetUsd: 1.25
  })

  await window.evaluate(async (id) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    await api.rpc({
      method: 'saveAgent',
      id,
      name: 'Snapshot Agent V2',
      description: '已更新',
      instructions: 'AGENT_INSTRUCTIONS_V2',
      defaultRecipeId: 'deep-research',
      defaultBudgetUsd: 2,
      maxConcurrentRuns: 1
    })
  }, agentId)
  const snapshot = execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `SELECT agent_name_snapshot || '|' || agent_instructions_snapshot FROM tasks WHERE id='${task?.id}'`
  ], { encoding: 'utf8' }).trim()
  expect(snapshot).toBe('Snapshot Agent V1|AGENT_INSTRUCTIONS_V1 <必须隔离>')

  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30_000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({
    timeout: 30_000
  })

  await window.getByRole('button', { name: 'Tasks' }).click()
  const row = window.locator('.task-row', { hasText: goal })
  await expect(row).toContainText('Agent · Snapshot Agent V1')
  await window.getByRole('button', { name: '看板' }).click()
  const boardCard = window.locator('.kanban-card', { hasText: goal })
  await expect(boardCard).toContainText('Agent · Snapshot Agent V1')
  await launched.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900)
  })
  await window.waitForTimeout(250)
  mkdirSync('.omx/state/agent-binding', { recursive: true })
  await window.screenshot({ path: '.omx/state/agent-binding/task-board.png' })
  await launched.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(900, 600)
  })
  await window.waitForTimeout(250)
  expect(await window.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  )).toBe(false)

  await window.getByRole('button', { name: 'Home' }).click()
  await window.getByLabel('Agent').selectOption(agentId)
  await window.getByLabel('Recipe').selectOption('deep-research')
  await window.locator('.input-card textarea').fill('定时 Agent 绑定')
  await window.getByRole('button', { name: '保存为自动化' }).click()
  await window.getByPlaceholder('自动化名称').fill('Agent 定时计划')
  await window.getByRole('button', { name: '保存自动化' }).click()
  await window.getByRole('button', { name: '查看自动化' }).click()
  const schedule = window.locator('.automation-card', { hasText: 'Agent 定时计划' })
  await expect(schedule).toContainText('Snapshot Agent V2')
  await schedule.getByRole('button', { name: '暂停' }).click()
  await window.evaluate(async (id) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    await api.rpc({ method: 'setAgentEnabled', agentId: id, enabled: false })
  }, agentId)
  await schedule.getByRole('button', { name: '启用' }).click()
  await expect(schedule.getByRole('alert')).toContainText('Agent 已停用')
  const replacementAgentId = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const replacement = await api.rpc({
      method: 'saveAgent',
      name: 'Replacement Agent',
      description: '用于计划改绑',
      instructions: '新的稳定指令',
      defaultRecipeId: 'deep-research',
      defaultBudgetUsd: 2,
      maxConcurrentRuns: 1
    }) as { id: string }
    return replacement.id
  })
  await schedule.getByRole('button', { name: '编辑' }).click()
  await window.getByLabel('自动化 Agent').selectOption(replacementAgentId)
  await launched.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900)
  })
  await window.waitForTimeout(250)
  await window.screenshot({ path: '.omx/state/agent-binding/schedule-rebind.png' })
  await window.getByRole('button', { name: '保存修改' }).click()
  await expect(schedule).toContainText('Replacement Agent')
  await schedule.getByRole('button', { name: '启用' }).click()
  await expect(schedule.getByRole('button', { name: '暂停' })).toBeVisible()
  expect(rendererErrors).toEqual([])
})
