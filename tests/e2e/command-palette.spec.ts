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

test('⌘K 检索页面、任务与交付物，任务页快捷键可批准和返回', async () => {
  launched = await launchApp()
  const { window } = launched
  const goal = await window.locator('.input-card textarea').inputValue()

  await window.keyboard.press('Meta+k')
  const palette = window.getByRole('dialog', { name: '命令面板' })
  await expect(palette).toBeVisible()
  mkdirSync('.omx/state/keyboard-first', { recursive: true })
  await window.screenshot({ path: '.omx/state/keyboard-first/command-palette.png' })
  await palette.getByLabel('搜索命令、任务和交付物').fill('Tasks')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('heading', { name: 'Tasks' })).toBeVisible()

  await window.keyboard.press('Meta+k')
  await palette.getByLabel('搜索命令、任务和交付物').fill('发起任务')
  await window.keyboard.press('Enter')
  await expect(window.locator('.input-card textarea')).toBeFocused()
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.keyboard.press('Meta+Enter')
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })

  await window.keyboard.press('Meta+k')
  await palette.getByLabel('搜索命令、任务和交付物').fill('交付物')
  await expect(palette.getByRole('option', { name: /交付物/ }).first()).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(palette).toBeHidden()
  await window.keyboard.press('Escape')
  await expect(window.getByRole('button', { name: '开始任务' })).toBeVisible()

  await window.keyboard.press('Meta+k')
  await palette.getByLabel('搜索命令、任务和交付物').fill(goal.slice(0, 8))
  await expect(palette.getByRole('option', { name: new RegExp(goal.slice(0, 8)) }).first()).toBeVisible()
})
