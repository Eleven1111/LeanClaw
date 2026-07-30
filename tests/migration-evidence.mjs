// T06 迁移证据入口。
//
// 为什么需要独立 harness：`better-sqlite3` 的原生模块按 Electron ABI 编译，
// 在 Node 下 `require` 会得到 ERR_DLOPEN_FAILED，所以 Vitest 只能用 mock 验证迁移逻辑。
// 真实 SQLite 的事务回滚、schema 对拍和未知对象保持必须在 Electron 进程里跑。
//
// 本文件是 Node 侧编排器：建立隔离测试根 -> 用 esbuild 把被测源码打成 CJS ->
// 在 `ELECTRON_RUN_AS_NODE=1` 下执行场景脚本 -> 清理。
import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const repoRoot = process.cwd()
const root = mkdtempSync(join(tmpdir(), 'leanclaw-migration-evidence-'))
const home = join(root, 'home')
const data = join(root, 'data')
const temp = join(root, 'tmp')
// 打包产物必须留在仓库的 node_modules 缓存里：被测代码 `require('better-sqlite3')`
// 需要沿目录向上解析到仓库自己的原生模块，放到临时根内会解析失败。
const bundleDir = join(repoRoot, 'node_modules', '.cache', 'leanclaw-migration-evidence')
for (const dir of [home, data, temp]) mkdirSync(dir, { recursive: true })
rmSync(bundleDir, { recursive: true, force: true })
mkdirSync(bundleDir, { recursive: true })

function bundle(entry, outfile) {
  const esbuild = join(repoRoot, 'node_modules', '.bin', 'esbuild')
  const result = spawnSync(
    esbuild,
    [
      entry,
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--target=node22',
      '--external:better-sqlite3',
      `--outfile=${outfile}`
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`esbuild 打包失败：${entry}`)
}

try {
  const dbBundle = join(bundleDir, 'db.cjs')
  const isolationBundle = join(bundleDir, 'test-isolation.cjs')
  bundle('src/runtime/db.ts', dbBundle)
  bundle('src/runtime/test-isolation.ts', isolationBundle)

  const electron = join(repoRoot, 'node_modules', '.bin', 'electron')
  const result = spawnSync(electron, ['tests/migration-evidence-scenarios.cjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LEANCLAW_TEST_ROOT: root,
      LEANCLAW_DATA_DIR: data,
      HOME: home,
      TMPDIR: temp,
      ELECTRON_RUN_AS_NODE: '1',
      ANTHROPIC_API_KEY: '',
      LEANCLAW_WEB_MOCK: '1',
      LEANCLAW_MIGRATION_DB_BUNDLE: dbBundle,
      LEANCLAW_MIGRATION_ISOLATION_BUNDLE: isolationBundle,
      LEANCLAW_MIGRATION_SCRATCH: join(root, 'scenarios'),
      LEANCLAW_MIGRATION_FIXTURE: join(
        repoRoot,
        'tests/fixtures/migrations/v8-old-binary/leanclaw.db'
      )
    },
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(root, { recursive: true, force: true })
  rmSync(bundleDir, { recursive: true, force: true })
}
