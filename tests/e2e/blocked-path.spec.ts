import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('验证拦截路径：伪造引用触发验证门 → 取消任务', async () => {
  launched = await launchApp({ LEANCLAW_FAULT: 'bad_citation' })
  const { window } = launched

  const startButton = window.getByRole('button', { name: '开始任务' })
  await expect(startButton).toBeEnabled({ timeout: 10000 })
  await startButton.click()

  await expect(window.getByText('任务被验证门拦下')).toBeVisible({ timeout: 30000 })
  await expect(window.locator('.chip-red', { hasText: 'Blocked' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(window.locator('.task-activity-feed')).toContainText('验证门拦截了交付')

  await window.getByRole('button', { name: '取消任务' }).click()
  await expect(window.locator('.chip-gray', { hasText: 'Cancelled' })).toBeVisible({ timeout: 10000 })
})
