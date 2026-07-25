import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('停线路径：不存在的文件触发 Andon → 取消任务', async () => {
  launched = await launchApp()
  const { window } = launched

  const pathInput = window.getByPlaceholder('输入文件路径（可直接拖入文件）')
  await expect(pathInput).not.toHaveValue('', { timeout: 10000 })
  await pathInput.fill('/nonexistent/x.md')

  const startButton = window.getByRole('button', { name: '开始任务' })
  await expect(startButton).toBeEnabled()
  await startButton.click()

  const andonCard = window.locator('#andon-card')
  await expect(andonCard).toBeVisible({ timeout: 30000 })
  await expect(andonCard.getByRole('heading', { name: '需要你处理' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(window.locator('.task-activity-feed')).toContainText('任务需要处理')
  await window.getByRole('button', { name: '取消任务' }).click()
  await expect(window.locator('.chip-gray', { hasText: 'Cancelled' })).toBeVisible({ timeout: 10000 })
})
