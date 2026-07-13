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

test('⌥Space 打开独立快速输入窗并直接启动任务', async () => {
  launched = await launchApp()
  const { app, window } = launched

  await expect(app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Alt+Space'))).resolves.toBe(true)
  await window.evaluate(() => (globalThis as unknown as { api: { openQuickCapture: () => Promise<void> } }).api.openQuickCapture())
  await expect.poll(() => app.windows().length).toBe(2)
  const quick = app.windows().find((page) => page !== window) as typeof window
  await expect(quick.locator('.quick-capture')).toBeVisible()
  await expect(quick.getByLabel('任务目标')).toBeFocused()
  mkdirSync('.omx/state/keyboard-first', { recursive: true })
  await quick.screenshot({ path: '.omx/state/keyboard-first/quick-capture.png' })
  await quick.getByLabel('任务目标').fill('快速研究 LeanClaw 的键盘工作流')
  await expect(quick.getByLabel('Recipe')).toHaveValue('deep-research')
  await quick.getByRole('button', { name: '开始' }).click()
  await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('quick=1'))?.isVisible()
  )).toBe(false)

  await expect.poll(async () => window.evaluate(() => document.visibilityState)).toBe('visible')
  await expect(window.getByText('快速研究 LeanClaw 的键盘工作流')).toBeVisible({ timeout: 30000 })
})
