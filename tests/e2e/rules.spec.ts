import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined
test.afterEach(async () => { if (launched) await closeApp(launched); launched = undefined })

test('Library：创建并编辑确定性规则集', async () => {
  launched = await launchApp()
  const { window } = launched
  await window.getByRole('button', { name: 'Library' }).click()
  await window.getByRole('button', { name: '新建规则集' }).click()
  await window.getByPlaceholder('规则集名称').fill('发布规则')
  await window.getByPlaceholder('最小长度').fill('100')
  await window.getByPlaceholder('最大长度').fill('5000')
  await window.getByPlaceholder('禁用词（每行一个）').fill('绝对有效\n全网第一')
  await window.getByPlaceholder('必含结构（每行一个，如 ## 结论）').fill('## 结论')
  await window.getByRole('button', { name: '保存规则集' }).click()
  await expect(window.getByRole('heading', { name: '发布规则' })).toBeVisible()
  await expect(window.getByText('100–5000 字符 · 2 个禁用词 · 1 个必含结构')).toBeVisible()
  await window.getByRole('button', { name: '编辑' }).last().click()
  await expect(window.getByPlaceholder('规则集名称')).toHaveValue('发布规则')
})
