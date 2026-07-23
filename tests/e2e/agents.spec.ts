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

test('Agent Center：创建、编辑、停启、引用保护、预选与重启持久化', async () => {
  launched = await launchApp()
  let { app, window, dataDir } = launched
  const consoleErrors: string[] = []
  const watchErrors = (): void => {
    window.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    window.on('pageerror', (error) => consoleErrors.push(error.message))
  }
  watchErrors()

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600))
  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await expect(window.locator('.page-title')).toHaveText('Agent')
  await expect(window.locator('.agent-empty')).toContainText('还没有 Agent')

  await window.getByRole('button', { name: '创建 Agent' }).click()
  await window.getByLabel('Agent 名称').fill('Research Agent')
  await window.getByLabel('用途说明').fill('负责带引用、可审计的研究任务。')
  await window.getByLabel('稳定指令').fill('核'.repeat(10_000))
  await window.getByLabel('默认 Recipe').selectOption('deep-research')
  await window.getByLabel('默认预算').fill('2.5')
  await window.getByLabel('最大并发').selectOption('2')
  expect(await window.locator('.agent-form').evaluate(
    (element) => element.scrollWidth > element.clientWidth
  )).toBe(false)
  await window.getByRole('button', { name: '保存 Agent' }).click()

  const card = window.locator('.agent-card', { hasText: 'Research Agent' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('深度研究')
  await expect(card).toContainText('$2.50')
  await expect(card).toContainText('最大并发 2')
  await expect(card).toContainText('已启用')
  const agentId = await card.getAttribute('data-agent-id')
  expect(agentId).toBeTruthy()
  const colorBefore = await card.locator('.agent-avatar').evaluate(
    (element) => getComputedStyle(element).backgroundColor
  )

  await card.getByRole('button', { name: '编辑' }).click()
  await window.getByLabel('Agent 名称').fill('Research Lead')
  await window.getByLabel('稳定指令').fill('优先核验一手来源。')
  await window.getByRole('button', { name: '保存 Agent' }).click()
  const renamed = window.locator('.agent-card', { hasText: 'Research Lead' })
  await expect(renamed).toBeVisible()
  const colorAfter = await renamed.locator('.agent-avatar').evaluate(
    (element) => getComputedStyle(element).backgroundColor
  )
  expect(colorAfter).toBe(colorBefore)

  await renamed.getByRole('button', { name: '停用' }).click()
  await expect(renamed).toContainText('已停用')
  await renamed.getByRole('button', { name: '启用' }).click()
  await expect(renamed).toContainText('已启用')

  await renamed.getByRole('button', { name: '用它发起任务' }).click()
  await expect(window.locator('.page-title')).toHaveText('新任务')
  await expect(window.getByLabel('Agent')).toHaveValue(agentId as string)
  await expect(window.getByLabel('Recipe')).toHaveValue('deep-research')
  await expect(window.getByLabel('预算 USD（可选）')).toHaveValue('2.5')

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await window.getByRole('button', { name: '创建 Agent' }).click()
  await window.getByLabel('Agent 名称').fill('Disposable')
  await window.getByLabel('用途说明').fill('')
  await window.getByLabel('稳定指令').fill('')
  await window.getByLabel('最大并发').selectOption('1')
  await window.getByRole('button', { name: '保存 Agent' }).click()
  const disposable = window.locator('.agent-card', { hasText: 'Disposable' })
  await disposable.getByRole('button', { name: '删除' }).click()
  await expect(disposable).toContainText('确定删除这个 Agent？')
  await disposable.getByRole('button', { name: '确认删除' }).click()
  await expect(disposable).toHaveCount(0)

  await app.close()
  launched = await launchApp({}, dataDir)
  ;({ app, window, dataDir } = launched)
  watchErrors()
  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  const persisted = window.locator('.agent-card', { hasText: 'Research Lead' })
  await expect(persisted).toBeVisible()

  const scheduleId = await window.evaluate(async () => {
    const browserApi = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const schedule = await browserApi.rpc({
      method: 'saveSchedule',
      name: 'Agent 引用计划',
      goal: '每天研究',
      inputPath: '',
      recipeId: 'deep-research',
      cadence: 'daily',
      timeOfDay: '08:00'
    }) as { id: string }
    return schedule.id
  })
  execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `UPDATE schedules SET agent_id='${agentId}' WHERE id='${scheduleId}'`
  ])
  await window.getByRole('button', { name: 'Home' }).click()
  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()

  const referenced = window.locator('.agent-card', { hasText: 'Research Lead' })
  await expect(referenced).toContainText('0 个任务 · 1 个自动化')
  await expect(referenced.getByRole('button', { name: '删除' })).toBeDisabled()
  await referenced.getByRole('button', { name: '停用' }).click()
  await expect(window.getByRole('alert')).toContainText('先暂停或改绑')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
  await window.waitForTimeout(250)
  mkdirSync('.omx/state/agents', { recursive: true })
  await window.screenshot({ path: '.omx/state/agents/agent-center.png' })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600))
  await window.waitForTimeout(250)
  const metrics = await window.evaluate(() => {
    const form = document.querySelector<HTMLElement>('.agent-form')
    return {
      bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      formOverflow: form ? form.scrollWidth > form.clientWidth : false
    }
  })
  expect(metrics).toEqual({ bodyOverflow: false, formOverflow: false })
  expect(consoleErrors).toEqual([])
})
