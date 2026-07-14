import { expect, test } from '@playwright/test'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined
let exportRoot = ''

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
  if (exportRoot) rmSync(exportRoot, { recursive: true, force: true })
})

test('诊断包只导出轮转日志与系统清单，不携带用户数据', async () => {
  exportRoot = mkdtempSync(join(tmpdir(), 'leanclaw-diagnostics-e2e-'))
  const archivePath = join(exportRoot, 'leanclaw-diagnostics.zip')
  launched = await launchApp({ LEANCLAW_DIAGNOSTICS_EXPORT_PATH: archivePath })
  const { window, dataDir } = launched

  writeFileSync(join(dataDir, 'secrets.json'), '{"apiKey":"sk-ant-e2e-secret"}')
  writeFileSync(join(dataDir, 'private-task.txt'), '客户机密任务正文')

  await window.getByRole('button', { name: 'Settings' }).click()
  const heading = window.getByRole('heading', { name: '诊断与日志' })
  await heading.scrollIntoViewIfNeeded()
  await window.getByRole('button', { name: '导出诊断包' }).click()
  await expect(window.getByRole('status')).toHaveText('已导出 leanclaw-diagnostics.zip')
  expect(existsSync(archivePath)).toBe(true)

  const entries = execFileSync('/usr/bin/unzip', ['-Z1', archivePath], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((entry) => entry && !entry.endsWith('/'))
  expect(entries.every((entry) => /\/(?:main|runtime)\.log(?:\.\d+)?$/.test(entry) || entry.endsWith('/system.json')), entries.join('\n')).toBe(true)
  expect(entries.some((entry) => entry.endsWith('/main.log'))).toBe(true)
  expect(entries.some((entry) => entry.endsWith('/runtime.log'))).toBe(true)
  expect(entries.some((entry) => entry.endsWith('/system.json'))).toBe(true)

  const archiveText = execFileSync('/usr/bin/unzip', ['-p', archivePath], { encoding: 'utf8' })
  expect(archiveText).toContain('diagnostics-exported')
  expect(archiveText).toContain('runtime-ready')
  expect(archiveText).not.toContain('sk-ant-e2e-secret')
  expect(archiveText).not.toContain('客户机密任务正文')
  expect(archiveText).not.toContain('secrets.json')
  expect(archiveText).not.toContain('private-task.txt')

  await window.getByRole('button', { name: '导出诊断包' }).click()
  await expect(window.getByRole('status')).toHaveText('已导出 leanclaw-diagnostics.zip')
  expect(execFileSync('/usr/bin/unzip', ['-t', archivePath], { encoding: 'utf8' })).toContain('No errors detected')

  mkdirSync('.omx/state/diagnostics', { recursive: true })
  await window.screenshot({ path: '.omx/state/diagnostics/settings.png' })
})
