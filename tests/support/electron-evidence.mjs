// 真实 SQLite 证据的共享启动器。
//
// 为什么需要它：`better-sqlite3` 的原生模块按 Electron ABI 编译，Node 下 `require` 得到
// ERR_DLOPEN_FAILED，所以 Vitest 只能用 mock 断言 Runtime 的数据库行为。凡是必须由真实
// SQLite 证明的结论（事务回滚、schema 对拍、两条投影路径逐字节一致），都由这里在
// `ELECTRON_RUN_AS_NODE=1 electron` 下运行。
//
// 流程：建立隔离测试根 -> 用 esbuild 把被测源码打成单一 CJS 模块图 -> 运行场景脚本 -> 清理。
import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

function bundle(repoRoot, entry, outfile) {
  const esbuild = join(repoRoot, 'node_modules', '.bin', 'esbuild')
  const result = spawnSync(
    esbuild,
    [
      entry,
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--target=node22',
      '--log-level=warning',
      '--external:better-sqlite3',
      '--external:electron',
      `--outfile=${outfile}`
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`esbuild 打包失败：${entry}`)
}

/**
 * @param options.scope        临时根与缓存目录的名字片段
 * @param options.script       场景脚本路径（相对仓库根，必须是 .cjs）
 * @param options.reexports    以单一模块图暴露给场景脚本的 `模块路径 -> 导出名数组`
 * @param options.entries      需要单独打包的入口：`环境变量名 -> 源文件路径`
 * @param options.env          追加的场景环境变量（不得覆盖四个隔离变量）
 */
export function runElectronEvidence(options) {
  const repoRoot = process.cwd()
  const root = mkdtempSync(join(tmpdir(), `leanclaw-${options.scope}-`))
  const home = join(root, 'home')
  const data = join(root, 'data')
  const temp = join(root, 'tmp')
  const bundleDir = join(repoRoot, 'node_modules', '.cache', `leanclaw-${options.scope}`)
  for (const dir of [home, data, temp]) mkdirSync(dir, { recursive: true })
  // 打包产物必须留在仓库的 node_modules 缓存里：被测代码 `require('better-sqlite3')`
  // 需要沿目录向上解析到仓库自己的原生模块，放到临时根内会解析失败。
  rmSync(bundleDir, { recursive: true, force: true })
  mkdirSync(bundleDir, { recursive: true })

  try {
    const bundleEnv = {}
    for (const [name, entry] of Object.entries(options.entries ?? {})) {
      const outfile = join(bundleDir, `${name.toLowerCase()}.cjs`)
      bundle(repoRoot, entry, outfile)
      bundleEnv[name] = outfile
    }
    if (options.reexports) {
      const facade = join(bundleDir, 'facade.ts')
      const lines = Object.entries(options.reexports).map(
        ([module, names]) => `export { ${names.join(', ')} } from '${join(repoRoot, module)}'`
      )
      writeFileSync(facade, `${lines.join('\n')}\n`, 'utf8')
      const outfile = join(bundleDir, 'runtime-under-test.cjs')
      bundle(repoRoot, facade, outfile)
      bundleEnv.LEANCLAW_EVIDENCE_MODULE = outfile
    }

    const electron = join(repoRoot, 'node_modules', '.bin', 'electron')
    const result = spawnSync(electron, [options.script], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        LEANCLAW_TEST_ROOT: root,
        LEANCLAW_DATA_DIR: data,
        HOME: home,
        TMPDIR: temp,
        ELECTRON_RUN_AS_NODE: '1',
        ANTHROPIC_API_KEY: '',
        LEANCLAW_WEB_MOCK: '1',
        LEANCLAW_EVIDENCE_SCRATCH: join(root, 'scenarios'),
        ...bundleEnv
      },
      stdio: 'inherit'
    })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(bundleDir, { recursive: true, force: true })
  }
}
