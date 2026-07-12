import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined
test.afterEach(async () => { if (launched) await closeApp(launched); launched = undefined })

test('深度研究交付后 Evidence 提供本地抓取快照', async () => {
  launched = await launchApp()
  const { window } = launched
  await window.locator('.recipe-row select').first().selectOption('deep-research')
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })
  await expect(window.getByRole('button', { name: '打开抓取快照' })).toHaveCount(2)
})
