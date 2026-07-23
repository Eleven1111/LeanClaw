import { expect, test } from '@playwright/test'
import { mkdirSync } from 'fs'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('参考式任务看板：清晰的工作区导航、工具栏与状态分栏', async () => {
  launched = await launchApp()
  const { app, window } = launched
  const consoleErrors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  window.on('pageerror', (error) => consoleErrors.push(error.message))

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
  mkdirSync('.omx/state/reference-ui', { recursive: true })
  await window.screenshot({ path: '.omx/state/reference-ui/home-v1.png' })

  await expect(window.locator('.sidebar-brand')).toContainText('LeanClaw')
  await expect(window.locator('.sidebar-group-label')).toHaveText(['工作区', '资料与交付', '系统'])
  await expect(window.getByRole('button', { name: 'Home' })).toContainText('发起任务')

  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })

  await window.getByRole('button', { name: 'Home' }).click()
  await window.locator('.input-card textarea').fill('整理本周用户反馈，输出一份可执行的改进清单。')
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30000 })
  await window.screenshot({ path: '.omx/state/reference-ui/task-workspace-v1.png' })

  await window.getByRole('button', { name: 'Tasks' }).click()
  await expect(window.locator('.page-title')).toHaveText('任务')
  await expect(window.locator('.tasks-toolbar')).toBeVisible()

  await window.getByRole('button', { name: '看板' }).click()
  await expect(window.locator('.tasks-page')).toHaveClass(/board-mode/)
  await expect(window.locator('.kanban-column')).toHaveCount(5)
  await expect(window.locator('.kanban-column[data-status="Running"]')).toBeVisible()
  await expect(window.locator('.kanban-column[data-status="Delivered"]')).toBeVisible()

  const shellMetrics = await window.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar')
    const board = document.querySelector<HTMLElement>('.kanban-board')
    const running = document.querySelector<HTMLElement>('.kanban-column[data-status="Running"]')
    const delivered = document.querySelector<HTMLElement>('.kanban-column[data-status="Delivered"]')
    if (!sidebar || !board || !running || !delivered) throw new Error('missing redesigned shell')
    return {
      sidebarWidth: sidebar.getBoundingClientRect().width,
      boardScrollable: board.scrollWidth > board.clientWidth,
      runningBackground: getComputedStyle(running).backgroundColor,
      deliveredBackground: getComputedStyle(delivered).backgroundColor
    }
  })

  expect(shellMetrics.sidebarWidth).toBeGreaterThanOrEqual(216)
  expect(shellMetrics.boardScrollable).toBe(true)
  expect(shellMetrics.runningBackground).not.toBe(shellMetrics.deliveredBackground)

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(2048, 1152))
  await window.waitForTimeout(120)
  await window.screenshot({ path: '.omx/state/reference-ui/implementation-v1.png' })
  expect(consoleErrors).toEqual([])
})
