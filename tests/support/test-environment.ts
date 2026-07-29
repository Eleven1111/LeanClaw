import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { assertTestIsolationEnvironment } from '../../src/runtime/test-isolation'

interface InstalledTestEnvironment {
  root: string
}

export function installTestEnvironment(scope: string): InstalledTestEnvironment {
  const root = mkdtempSync(join(tmpdir(), `leanclaw-${scope}-`))
  const home = join(root, 'home')
  const data = join(root, 'data')
  const temp = join(root, 'tmp')
  for (const dir of [home, data, temp]) mkdirSync(dir, { recursive: true })

  process.env.LEANCLAW_TEST_ROOT = root
  process.env.LEANCLAW_DATA_DIR = data
  process.env.HOME = home
  process.env.TMPDIR = temp
  process.env.ANTHROPIC_API_KEY = ''
  process.env.LEANCLAW_WEB_MOCK = '1'
  assertTestIsolationEnvironment()
  return { root }
}

export function cleanupTestEnvironment(installed: InstalledTestEnvironment): void {
  rmSync(installed.root, { recursive: true, force: true })
}
