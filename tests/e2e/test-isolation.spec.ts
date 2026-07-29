import { isAbsolute, relative, resolve, sep } from 'path'
import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('测试进程、Electron Main 与 Runtime 数据根保持在同一隔离根内', async () => {
  launched = await launchApp({
    LEANCLAW_TEST_ROOT: '/',
    LEANCLAW_DATA_DIR: '/tmp/forbidden-leanclaw-data',
    HOME: '/Users/real-user',
    TMPDIR: '/tmp'
  })
  const environment = await launched.app.evaluate(({ app }) => ({
    userData: app.getPath('userData'),
    testRoot: process.env.LEANCLAW_TEST_ROOT,
    dataDir: process.env.LEANCLAW_DATA_DIR,
    home: process.env.HOME,
    temp: process.env.TMPDIR
  }))

  const root = environment.testRoot
  if (!root) throw new Error('Electron Main 未收到 LEANCLAW_TEST_ROOT')
  for (const [label, path] of Object.entries(environment)) {
    if (label === 'testRoot') continue
    if (!path) throw new Error(`${label} 缺失`)
    const rel = relative(resolve(root), resolve(path))
    expect(rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))).toBe(
      true
    )
  }
  expect(environment.userData).toBe(launched.dataDir)
  expect(environment.userData).not.toContain('/.leanclaw')
})
