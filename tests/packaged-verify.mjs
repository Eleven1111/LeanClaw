// T08：最终打包产物验证的受控 launcher。
//
// 三条纪律：
// 1. 只验证**刚生成**的产物。脚本拒绝比当前源码更旧的 DMG/ZIP，不允许复用旧 `.app`。
// 2. 被验证的二进制来自**解压后的 ZIP**，不是 `release/mac-arm64` 里的构建中间产物。
// 3. 隔离环境由本 launcher 在启动 packaged app **之前**安装（T05 边界：CDP 连上已启动进程后
//    无法追溯改环境）。
//
// 覆盖：应用版本、Electron 与 native ABI、签名现状、DMG/ZIP 完整性与 SHA-256、
// 空数据根首启 + 核心 Journey、以及用 T06 old-binary fixture 验证**packaged migration**。
//
// 当前签名是 ad-hoc（`identity: "-"`、`hardenedRuntime: false`）。本脚本通过不等于
// 正式发行、公证通过或 Shipped。
import { execFileSync, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const repoRoot = process.cwd()
const releaseDir = join(repoRoot, 'release')
const fixture = join(repoRoot, 'tests/fixtures/migrations/v8-old-binary/leanclaw.db')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const expectedVersion = pkg.version
const expectedElectron = JSON.parse(
  readFileSync(join(repoRoot, 'node_modules/electron/package.json'), 'utf8')
).version

const ledger = []

function log(line) {
  process.stdout.write(`[packaged-verify] ${line}\n`)
}

function record(name, detail) {
  ledger.push({ name, detail })
  log(`OK   ${name} — ${detail}`)
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options })
}

// codesign 把详情写到 stderr，必须两路都收
function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  }
}

function sqlite(dbPath, sql) {
  return run('/usr/bin/sqlite3', ['-cmd', '.timeout 5000', dbPath, sql]).trim()
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function findArtifact(extension) {
  if (!existsSync(releaseDir)) throw new Error('release/ 不存在：先执行 npm run dist:mac')
  const matches = readdirSync(releaseDir).filter((name) => name.endsWith(extension))
  if (matches.length !== 1) {
    throw new Error(`release/ 下应恰好有一个 ${extension}，实际 ${matches.length} 个`)
  }
  return join(releaseDir, matches[0])
}

// 产物必须比源码新，否则我们在验证一个旧包
function assertFresherThanSources(artifact) {
  const newer = run('/usr/bin/find', [
    join(repoRoot, 'src'),
    join(repoRoot, 'package.json'),
    join(repoRoot, 'package-lock.json'),
    '-newer',
    artifact
  ])
    .split('\n')
    .filter(Boolean)
  if (newer.length > 0) {
    throw new Error(
      `产物比源码旧（${newer.length} 个文件更新，例如 ${newer[0]}）：${artifact}。T08 必须验证重新生成的产物`
    )
  }
}

const dmg = findArtifact('.dmg')
const zip = findArtifact('.zip')
for (const artifact of [dmg, zip]) assertFresherThanSources(artifact)
record('产物是本轮重新生成的', `${dmg.split('/').pop()} / ${zip.split('/').pop()} 均新于 src/ 与锁文件`)

const root = mkdtempSync(join(tmpdir(), 'leanclaw-packaged-verify-'))
const home = join(root, 'home')
const temp = join(root, 'tmp')
const unpacked = join(root, 'unzipped')
for (const dir of [home, temp, unpacked]) mkdirSync(dir, { recursive: true })

try {
  // 1) 归档完整性与 checksum
  run('/usr/bin/hdiutil', ['verify', dmg])
  record('DMG 完整性', `hdiutil verify 通过 · sha256=${sha256(dmg)}`)
  run('/usr/bin/unzip', ['-t', zip])
  record('ZIP 完整性', `unzip -t 无错误 · sha256=${sha256(zip)}`)

  // 2) 从 ZIP 解压出被验证的二进制
  run('/usr/bin/unzip', ['-q', zip, '-d', unpacked])
  const appBundle = join(unpacked, 'LeanClaw.app')
  const binary = join(appBundle, 'Contents/MacOS/LeanClaw')
  if (!existsSync(binary)) throw new Error('ZIP 里没有预期的 packaged binary')
  record('被验证对象来自 ZIP', binary.replace(root, '<tmp>'))

  // 3) 应用版本
  const plistVersion = run('/usr/bin/defaults', [
    'read',
    join(appBundle, 'Contents/Info.plist'),
    'CFBundleShortVersionString'
  ]).trim()
  const bundleId = run('/usr/bin/defaults', [
    'read',
    join(appBundle, 'Contents/Info.plist'),
    'CFBundleIdentifier'
  ]).trim()
  if (plistVersion !== expectedVersion) {
    throw new Error(`产物版本 ${plistVersion} 与 package.json 的 ${expectedVersion} 不一致`)
  }
  if (bundleId !== pkg.build.appId) throw new Error(`Bundle ID 不是 ${pkg.build.appId}`)
  record('应用版本与 Bundle ID', `${plistVersion} · ${bundleId}`)

  // 4) Electron 与 native ABI
  const frameworkPlist = join(
    appBundle,
    'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist'
  )
  // Electron Framework 的 plist 只有 CFBundleVersion，没有 CFBundleShortVersionString
  const electronVersion = run('/usr/bin/defaults', [
    'read',
    frameworkPlist,
    'CFBundleVersion'
  ]).trim()
  if (electronVersion !== expectedElectron) {
    throw new Error(`产物 Electron ${electronVersion} 与本地 ${expectedElectron} 不一致`)
  }
  const nativeModule = join(
    appBundle,
    'Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  )
  if (!existsSync(nativeModule)) throw new Error('better-sqlite3 原生模块未被 unpack 进产物')
  const arch = run('/usr/bin/file', [nativeModule])
  if (!arch.includes('arm64')) throw new Error(`原生模块架构不是 arm64：${arch.trim()}`)
  record('Electron 与 native ABI', `Electron ${electronVersion} · better_sqlite3.node arm64`)

  // 5) 签名现状：ad-hoc，不冒充正式发行
  const verify = runCapture('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appBundle
  ])
  if (verify.status !== 0) throw new Error(`codesign 校验失败：${verify.output.trim()}`)
  const details = runCapture('/usr/bin/codesign', ['-dv', '--verbose=4', appBundle])
  const adhoc = /Signature=adhoc/.test(details.output) || !/Authority=/.test(details.output)
  if (!adhoc) {
    throw new Error(
      `产物出现签名机构，与当前 ad-hoc 配置不符，需要人工复核：${details.output.trim()}`
    )
  }
  record('签名现状', 'codesign --verify --deep --strict 通过；Signature=adhoc（非正式发行、未公证）')

  // 6) 空数据根首启 + 核心 Journey
  const freshData = join(root, 'data-fresh')
  mkdirSync(freshData, { recursive: true })
  const journey = spawnSync(process.execPath, ['tests/phase2-packaged-smoke.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LEANCLAW_TEST_ROOT: root,
      LEANCLAW_DATA_DIR: freshData,
      HOME: home,
      TMPDIR: temp,
      LEANCLAW_PACKAGED_APP: binary,
      LEANCLAW_PACKAGED_DATA_DIR: freshData,
      ANTHROPIC_API_KEY: '',
      LEANCLAW_WEB_MOCK: '1'
    },
    stdio: 'inherit'
  })
  if (journey.status !== 0) throw new Error('packaged 空库首启 Journey 失败')
  const freshDb = join(freshData, 'leanclaw.db')
  record(
    '空数据根首启 + 核心 Journey',
    `schema_version=${sqlite(freshDb, 'SELECT version FROM schema_version')} · Journey A delivered`
  )

  // 7) packaged migration：用 T06 old-binary fixture 预置旧库，再由最终 .app 升级
  if (!existsSync(fixture)) throw new Error('缺少 T06 old-binary fixture')
  const legacyData = join(root, 'data-legacy')
  mkdirSync(legacyData, { recursive: true })
  const legacyDb = join(legacyData, 'leanclaw.db')
  copyFileSync(fixture, legacyDb)
  const before = {
    version: sqlite(legacyDb, 'SELECT version FROM schema_version'),
    tasks: sqlite(legacyDb, 'SELECT COUNT(*) FROM tasks'),
    goal: sqlite(legacyDb, `SELECT goal FROM tasks WHERE id='legacy-task'`),
    audit: sqlite(legacyDb, 'SELECT COUNT(*) FROM legacy_task_audit'),
    unknown: sqlite(
      legacyDb,
      `SELECT group_concat(name) FROM sqlite_master
       WHERE name IN ('legacy_task_audit','idx_legacy_manual_task_created','trg_legacy_task_audit')`
    )
  }
  if (before.version !== '8') throw new Error('fixture 起始版本必须是 v8')

  const migrated = spawnSync(process.execPath, ['tests/phase2-packaged-smoke.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LEANCLAW_TEST_ROOT: root,
      LEANCLAW_DATA_DIR: legacyData,
      HOME: home,
      TMPDIR: temp,
      LEANCLAW_PACKAGED_APP: binary,
      LEANCLAW_PACKAGED_DATA_DIR: legacyData,
      ANTHROPIC_API_KEY: '',
      LEANCLAW_WEB_MOCK: '1'
    },
    stdio: 'inherit'
  })
  if (migrated.status !== 0) throw new Error('packaged 旧库升级后的 Journey 失败')

  const after = {
    version: sqlite(legacyDb, 'SELECT version FROM schema_version'),
    goal: sqlite(legacyDb, `SELECT goal FROM tasks WHERE id='legacy-task'`),
    unknown: sqlite(
      legacyDb,
      `SELECT group_concat(name) FROM sqlite_master
       WHERE name IN ('legacy_task_audit','idx_legacy_manual_task_created','trg_legacy_task_audit')`
    ),
    legacyAudit: sqlite(
      legacyDb,
      `SELECT COUNT(*) FROM legacy_task_audit WHERE task_id='legacy-task'`
    ),
    indexes: sqlite(legacyDb, `SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'idx_%'`)
  }
  if (after.version !== '13') throw new Error(`packaged 升级后版本为 ${after.version}，应为 13`)
  if (after.goal !== before.goal) throw new Error('packaged 升级改变了历史 Task 关键值')
  if (after.unknown !== before.unknown) throw new Error('packaged 升级删除了未知对象')
  if (after.legacyAudit !== before.audit) throw new Error('packaged 升级改动了未知历史表的旧行')
  if (Number(after.indexes) < 14) throw new Error(`packaged 升级后索引数 ${after.indexes} 不足`)
  record(
    'packaged migration（T06 fixture）',
    `v8 -> v${after.version} · 历史关键值保持 · 未知对象保持 · idx_* ${after.indexes} 个 · 升级后 Journey A delivered`
  )

  // 8) Runtime 健康在 Journey 里已由 getRuntimeOverview 断言（runs >= 1），此处复述边界
  record(
    '边界声明',
    'ad-hoc 签名、未公证、未接入 updater；本次通过只等于 Packaged smoke pass，不等于 Release ready 或 Shipped'
  )

  log('')
  log(`最终产物验证台账：${ledger.length}/${ledger.length} OK`)
  log(`DMG sha256 = ${sha256(dmg)}`)
  log(`ZIP sha256 = ${sha256(zip)}`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
