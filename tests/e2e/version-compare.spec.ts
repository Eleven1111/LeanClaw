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

test('增量修改后默认并排比较最新两个交付版本', async () => {
  launched = await launchApp()
  const { window } = launched

  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })
  await expect(window.getByRole('button', { name: '版本对比' })).toBeDisabled()
  await expect(window.evaluate(() => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    return api.rpc({ method: 'getDeliverableHistory', artifactId: 'missing-artifact' }).then(
      () => 'unexpected-success',
      (error: Error) => error.message
    )
  })).resolves.toContain('交付物不存在')

  await window.getByPlaceholder(/继续修改/).fill('在结尾增加一句：版本二补充说明。')
  await window.getByRole('button', { name: '提交修改' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })

  await window.getByRole('button', { name: '版本对比' }).click()
  const compare = window.getByRole('region', { name: '版本对比' })
  await expect(compare).toBeVisible()
  await expect(compare.getByLabel('旧版本')).toHaveValue(/.+/)
  await expect(compare.getByLabel('新版本')).toHaveValue(/.+/)
  await expect(compare.locator('.version-pane')).toHaveCount(2)
  await expect(compare.locator('.version-pane').first().getByText('v1')).toBeVisible()
  await expect(compare.locator('.version-pane').last().getByText('v2')).toBeVisible()
  await expect(compare.getByLabel('逐行差异').locator('.diff-add, .diff-remove').first()).toBeVisible()
  await window.getByRole('button', { name: '关闭' }).click()
  await window.getByRole('button', { name: 'Deliverables' }).click()
  await expect(window.locator('.grid-card')).toHaveCount(1)
  await window.locator('.grid-card').click()
  await window.getByRole('button', { name: '版本对比' }).click()
  await expect(compare).toBeVisible()
  mkdirSync('.omx/state/version-compare', { recursive: true })
  await compare.scrollIntoViewIfNeeded()
  await window.screenshot({ path: '.omx/state/version-compare/version-compare.png' })
})
