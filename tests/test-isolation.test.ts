import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  assertTestIsolationEnvironment,
  isPathAllowed
} from '../src/runtime/test-isolation'

describe('test isolation contract', () => {
  it('Vitest 在测试文件加载前安装隔离环境', () => {
    const root = process.env.LEANCLAW_TEST_ROOT
    if (!root) throw new Error('Vitest 未安装 LEANCLAW_TEST_ROOT')
    expect(process.env.LEANCLAW_DATA_DIR).toContain(root)
    expect(process.env.HOME).toContain(root)
    expect(process.env.TMPDIR).toContain(root)
    expect(() => assertTestIsolationEnvironment()).not.toThrow()
  })

  it('requires HOME, data root and TMPDIR to stay inside the explicit test root', () => {
    expect(() =>
      assertTestIsolationEnvironment({
        LEANCLAW_TEST_ROOT: '/tmp/leanclaw-test',
        LEANCLAW_DATA_DIR: '/tmp/leanclaw-test/data',
        HOME: '/Users/real-user',
        TMPDIR: '/tmp/leanclaw-test/tmp'
      })
    ).toThrow(/HOME/)

    expect(() =>
      assertTestIsolationEnvironment({
        LEANCLAW_TEST_ROOT: '/tmp/leanclaw-test',
        LEANCLAW_DATA_DIR: '/tmp/leanclaw-test/data',
        HOME: '/tmp/leanclaw-test/home',
        TMPDIR: '/tmp/leanclaw-test/tmp'
      })
    ).not.toThrow()
  })

  it('test root is an additional hard boundary even when allowedDirs is too broad', () => {
    expect(
      isPathAllowed('/tmp/leanclaw-test/workspace/report.md', ['/tmp'], {
        LEANCLAW_TEST_ROOT: '/tmp/leanclaw-test'
      })
    ).toBe(true)
    expect(
      isPathAllowed('/tmp/leanclaw-test/..cache/report.md', ['/tmp'], {
        LEANCLAW_TEST_ROOT: '/tmp/leanclaw-test'
      })
    ).toBe(true)
    expect(
      isPathAllowed('/tmp/real-user-data/leanclaw.db', ['/tmp'], {
        LEANCLAW_TEST_ROOT: '/tmp/leanclaw-test'
      })
    ).toBe(false)
  })

  it('所有自动测试入口都先安装隔离根，runtime smoke 不再直接启动真实数据根', () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')
    expect(read('vitest.config.ts')).toContain(
      "globalSetup: ['tests/support/vitest-global-setup.ts']"
    )
    expect(read('playwright.config.ts')).toContain(
      "globalSetup: 'tests/support/playwright-global-setup.ts'"
    )
    expect(JSON.parse(read('package.json')).scripts.smoke).toBe('node tests/runtime-smoke.mjs')

    expect(JSON.parse(read('package.json')).scripts['migration:evidence']).toBe(
      'node tests/migration-evidence.mjs'
    )

    for (const path of ['tests/runtime-smoke.mjs', 'tests/migration-evidence.mjs']) {
      const entry = read(path)
      for (const key of ['LEANCLAW_TEST_ROOT', 'LEANCLAW_DATA_DIR', 'HOME', 'TMPDIR']) {
        expect(entry).toContain(key)
      }
      expect(entry).toContain('rmSync(root, { recursive: true, force: true })')
    }

    // 迁移证据场景在建库前必须先断言隔离契约，且只读取受控 fixture
    const scenarios = read('tests/migration-evidence-scenarios.cjs')
    expect(scenarios).toContain('assertTestIsolationEnvironment()')
    expect(scenarios).not.toContain('.leanclaw')
  })
})
