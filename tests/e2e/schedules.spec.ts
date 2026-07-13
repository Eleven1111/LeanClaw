import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined
test.afterEach(async () => { if (launched) await closeApp(launched); launched = undefined })

test('Home：保存、暂停和启用定时任务', async () => {
  launched = await launchApp()
  const { window } = launched
  await window.getByRole('button', { name: '保存为定时任务' }).click()
  await window.getByPlaceholder('计划名称').fill('每日摘要')
  await window.getByLabel('重复频率').selectOption('weekdays')
  await window.getByLabel('执行时间').fill('08:30')
  await window.getByRole('button', { name: '保存计划' }).click()
  const card = window.locator('.schedule-card', { hasText: '每日摘要' })
  await expect(card).toContainText('工作日 08:30')
  await card.getByRole('button', { name: '暂停' }).click()
  await expect(card.getByRole('button', { name: '启用' })).toBeVisible()
  await card.getByRole('button', { name: '启用' }).click()
  await expect(card.getByRole('button', { name: '暂停' })).toBeVisible()
})
