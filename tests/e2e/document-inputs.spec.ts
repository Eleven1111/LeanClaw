import { expect, test } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined
test.afterEach(async () => { if (launched) await closeApp(launched); launched = undefined })

async function deliverInput(path: string): Promise<void> {
  const { window } = launched as LaunchedApp
  await window.getByPlaceholder('输入文件路径（可直接拖入文件）').fill(path)
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })
}

test('PDFKit 文本输入端到端交付', async () => {
  launched = await launchApp()
  const bytes = await launched.app.evaluate(async ({ BrowserWindow }) =>
    Array.from(await BrowserWindow.getAllWindows()[0].webContents.printToPDF({ printBackground: true })))
  const path = join(launched.dataDir, 'fixture.pdf')
  writeFileSync(path, Buffer.from(bytes))
  await deliverInput(path)
})

test('XLSX OOXML 输入端到端交付', async () => {
  launched = await launchApp()
  const root = join(launched.dataDir, 'xlsx-fixture')
  mkdirSync(join(root, 'xl', 'worksheets'), { recursive: true })
  writeFileSync(join(root, 'xl', 'sharedStrings.xml'), '<sst><si><t>主题</t></si><si><t>可靠执行</t></si><si><t>说明</t></si><si><t>任务必须经过验证门并保留证据</t></si></sst>')
  writeFileSync(join(root, 'xl', 'worksheets', 'sheet1.xml'), '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row><row><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>')
  const path = join(launched.dataDir, 'fixture.xlsx')
  execFileSync('/usr/bin/zip', ['-qr', path, '.'], { cwd: root })
  await deliverInput(path)
})
