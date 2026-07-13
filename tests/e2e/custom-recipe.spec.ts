import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'
import { _electron as electron } from '@playwright/test'
import { join } from 'path'

let launched: LaunchedApp | undefined
test.afterEach(async () => { if (launched) await closeApp(launched); launched = undefined })

test('组合并执行一个显式引用规则集的线性 Recipe', async () => {
  launched = await launchApp()
  const { window } = launched
  await window.getByRole('button', { name: 'Library' }).click()
  await window.getByRole('button', { name: '新建规则集' }).click()
  await window.getByPlaceholder('规则集名称').fill('宽松规则')
  await window.getByPlaceholder('最大长度').fill('20000')
  await window.getByRole('button', { name: '保存规则集' }).click()
  await expect(window.getByRole('button', { name: '组合 Recipe' })).toBeEnabled()
  await window.getByRole('button', { name: '组合 Recipe' }).click()
  await window.getByPlaceholder('Recipe 名称').fill('自定义周报')
  await window.getByPlaceholder('Recipe 目标').fill('根据素材生成结构化周报')
  await window.getByRole('button', { name: '保存 Recipe' }).click()
  const card = window.locator('.recipe-card', { hasText: '自定义周报' })
  await expect(card).toContainText('8 步 · 规则集：宽松规则')
  await card.getByRole('button', { name: '用这个 Recipe 发起' }).click()
  await expect(window.locator('.recipe-row select').first()).toHaveValue(/custom:/)
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })
  await expect(window.getByText('自定义规则集检查通过', { exact: true })).toBeVisible()

  const dataDir = launched.dataDir
  await launched.app.close()
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...(process.env as Record<string, string>), LEANCLAW_DATA_DIR: dataDir, ANTHROPIC_API_KEY: '', LEANCLAW_WEB_MOCK: '1' }
  })
  const restarted = await app.firstWindow()
  launched = { app, window: restarted, dataDir }
  await restarted.getByRole('button', { name: 'Library' }).click()
  await expect(restarted.getByText('8 步 · 规则集：宽松规则')).toBeVisible()
})
