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

test('视觉收口：应用图标、统一空状态与批准卡退场', async () => {
  launched = await launchApp()
  const { app, window } = launched

  const appIcon = await app.evaluate(({ nativeImage }) => {
    const image = nativeImage.createFromPath(`${process.cwd()}/resources/icon.png`)
    return { empty: image.isEmpty(), size: image.getSize() }
  })
  expect(appIcon.empty).toBe(false)
  expect(appIcon.size).toEqual({ width: 1024, height: 1024 })

  await window.getByRole('button', { name: 'Deliverables' }).click()
  await expect(window.getByText('还没有交付物', { exact: true })).toBeVisible()
  await expect(window.locator('.empty-state-mark span')).toHaveCount(3)
  await window.waitForTimeout(160)
  mkdirSync('.omx/state/visual-polish', { recursive: true })
  await window.screenshot({ path: '.omx/state/visual-polish/empty-state.png' })

  await window.getByRole('button', { name: 'Home' }).click()
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.presence-exit .card.approval')).toBeVisible()
  await expect(window.locator('.card.approval')).toHaveCount(0, { timeout: 2000 })
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })
})
