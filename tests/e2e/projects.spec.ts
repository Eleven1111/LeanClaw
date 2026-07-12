import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined
test.afterEach(async () => {
  if (launched) await closeApp(launched)
  launched = undefined
})

test('Projects：显式选择项目创建任务并聚合交付物', async () => {
  launched = await launchApp()
  const { window } = launched

  await window.getByRole('button', { name: 'Projects' }).click()
  await window.getByRole('button', { name: '新建项目' }).click()
  await window.getByPlaceholder('项目名称').fill('客户研究')
  await window.getByPlaceholder('项目说明').fill('人工维护的项目容器')
  await window.getByPlaceholder('Saved Instructions（创建任务时注入快照）').fill('使用中文回答。')
  await window.getByRole('button', { name: '保存', exact: true }).click()
  await expect(window.getByRole('heading', { name: '客户研究' })).toBeVisible()

  await window.getByRole('button', { name: 'Home' }).click()
  await window.getByLabel('Project').selectOption({ label: '客户研究' })
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('Project：客户研究', { exact: false })).toBeVisible({ timeout: 15000 })
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })

  await window.getByRole('button', { name: 'Projects' }).click()
  await window.getByText('客户研究', { exact: true }).first().click()
  await expect(window.getByText(/1 个任务 · 1 个交付物/)).toBeVisible()
})
