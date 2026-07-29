import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'leanclaw-runtime-smoke-'))
const home = join(root, 'home')
const data = join(root, 'data')
const temp = join(root, 'tmp')
for (const dir of [home, data, temp]) mkdirSync(dir, { recursive: true })

try {
  const electron = join(process.cwd(), 'node_modules', '.bin', 'electron')
  const result = spawnSync(electron, ['out/main/runtime.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LEANCLAW_TEST_ROOT: root,
      LEANCLAW_DATA_DIR: data,
      HOME: home,
      TMPDIR: temp,
      LEANCLAW_SMOKE: '1',
      ELECTRON_RUN_AS_NODE: '1',
      ANTHROPIC_API_KEY: '',
      LEANCLAW_WEB_MOCK: '1'
    },
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(root, { recursive: true, force: true })
}
