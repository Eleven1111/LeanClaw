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

test('主路径：启动任务 → 批准写入 → 交付 → Tasks 归档', async () => {
  launched = await launchApp()
  const { window } = launched

  const startButton = window.getByRole('button', { name: '开始任务' })
  await expect(startButton).toBeEnabled({ timeout: 10000 })

  const goalText = await window.locator('.input-card textarea').inputValue()
  expect(goalText.trim().length).toBeGreaterThan(0)

  await startButton.click()

  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()

  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })
  await expect(window.locator('.markdown-preview h1')).toBeVisible()
  await expect(window.locator('.step-estimate').first()).toBeVisible()
  mkdirSync('.omx/state/progress-presentation', { recursive: true })
  await window.locator('.steps').screenshot({ path: '.omx/state/progress-presentation/steps.png' })
  await window.locator('.step-focus-link').first().click()
  await expect(window.getByRole('heading', { name: 'Run Inspector' })).toBeVisible()
  await expect(window.locator('.run-step-detail')).toBeVisible()
  await window.getByRole('button', { name: '回到任务' }).click()

  await window.getByRole('button', { name: 'Deliverables' }).click()
  await window.locator('.grid-card').first().click()
  await expect(window.locator('.deliverable-preview .markdown-preview h1')).toBeVisible()
  await expect(window.getByRole('button', { name: '复制' })).toBeEnabled()
  await expect(window.getByRole('button', { name: '另存为' })).toBeEnabled()
  await expect(window.getByRole('button', { name: '导出 PDF' })).toBeEnabled()
  await window.getByRole('button', { name: '复制' }).click()
  await expect(window.getByRole('status')).toHaveText('已复制全文')

  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.locator('.filter-chip', { hasText: 'Delivered' }).click()

  const deliveredRow = window.locator('.task-row', { hasText: goalText })
  await expect(deliveredRow).toBeVisible({ timeout: 10000 })
  await deliveredRow.getByRole('button', { name: '归档' }).click()

  await window.locator('.filter-chip', { hasText: 'Archived' }).click()
  const archivedRow = window.locator('.task-row', { hasText: goalText })
  await expect(archivedRow).toBeVisible({ timeout: 10000 })
})
