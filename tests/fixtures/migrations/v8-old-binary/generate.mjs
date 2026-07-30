// 生成 T06 的 v8 old-binary fixture。
//
// 关键要求：v8 的表结构必须由 **旧代码自己的 initDb()** 创建，不是从当前 v13 库倒拆。
// 做法：把已核验的 v8 锚点提交签出到临时 worktree -> 用该提交自己的 lockfile 安装并构建 ->
// 在隔离 HOME/TMPDIR/LEANCLAW_DATA_DIR 下启动旧 Runtime 入口（它在没有 parentPort 时
// 先 initDb() 再退出）-> 只向该库写入公开、合成、确定性的数据 -> 校验、复制、记账、清理。
//
// 隐私边界：脚本从不读取、复制或 hash 真实 `~/.leanclaw`；旧 Runtime 的 HOME 与数据根
// 都被强制指向临时目录，输出目录也拒绝落在真实 HOME 的数据目录里。
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { dirname, join, resolve } from 'path'

const SOURCE_COMMIT = '15831e5'
const EXPECTED_VERSION = 8
const SQLITE = '/usr/bin/sqlite3'

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '../../../..')
const outDir = resolve(process.argv[2] ?? dirname(new URL(import.meta.url).pathname))

function log(line) {
  process.stdout.write(`[v8-fixture] ${line}\n`)
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options })
}

function sql(dbPath, statement, flags = []) {
  return run(SQLITE, [...flags, dbPath, statement]).trim()
}

function refuseUnsafeOutput() {
  const forbidden = [homedir(), join(homedir(), '.leanclaw')]
  for (const path of forbidden) {
    if (outDir === path || outDir.startsWith(`${path}/.leanclaw`)) {
      throw new Error(`拒绝把 fixture 写入真实用户数据目录：${outDir}`)
    }
  }
  if (outDir === '/' || outDir === homedir()) throw new Error(`输出目录不合法：${outDir}`)
}

function verifyAnchor() {
  const commit = run('git', ['rev-parse', SOURCE_COMMIT], { cwd: repoRoot }).trim()
  const source = run('git', ['show', `${SOURCE_COMMIT}:src/runtime/db.ts`], { cwd: repoRoot })
  const versions = [...source.matchAll(/^\s+version: (\d+),$/gm)].map((match) => Number(match[1]))
  const max = Math.max(...versions)
  if (max !== EXPECTED_VERSION) {
    throw new Error(`锚点提交的最高 migration 版本为 v${max}，不是 v${EXPECTED_VERSION}`)
  }
  if (!/const SCHEMA = `/.test(source)) throw new Error('锚点提交缺少完整 SCHEMA 定义')
  run('git', ['cat-file', '-e', `${SOURCE_COMMIT}:package-lock.json`], { cwd: repoRoot })
  const pkg = JSON.parse(run('git', ['show', `${SOURCE_COMMIT}:package.json`], { cwd: repoRoot }))
  if (pkg.main !== 'out/main/index.js') throw new Error('锚点提交缺少预期构建入口')
  log(`锚点已核验：${commit} 最高版本 v${max}，含 SCHEMA、lockfile 与构建入口`)
  return commit
}

// 公开、合成、确定性的历史数据。所有 id/时间/正文都是虚构测试值，与真实用户内容无关。
const SEED_SQL = `
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

INSERT INTO tasks
  (id, project_id, goal, brief, input_path, recipe_id, status, created_at, updated_at,
   budget_usd, refine_instructions, project_instructions_snapshot, schedule_id)
VALUES
  ('legacy-task', NULL, 'v8 旧任务迁移验证', '旧 Task Brief', '',
   'file-edit-summarize', 'delivered', '2026-07-01T08:00:00.000Z',
   '2026-07-01T08:03:00.000Z', 1.5, NULL, NULL, 'legacy-schedule');

INSERT INTO runs
  (id, task_id, recipe_id, status, current_step_index, resume_step_index, started_at, ended_at)
VALUES
  ('legacy-run', 'legacy-task', 'file-edit-summarize', 'delivered', 0, NULL,
   '2026-07-01T08:00:00.000Z', '2026-07-01T08:03:00.000Z');

INSERT INTO steps
  (id, run_id, idx, name, title, kind, status, attempt, output_summary, started_at, ended_at)
VALUES
  ('legacy-step', 'legacy-run', 0, 'read_input', '读取输入', 'model', 'done', 1,
   '已读取旧输入', '2026-07-01T08:00:00.000Z', '2026-07-01T08:01:00.000Z');

INSERT INTO artifacts
  (id, task_id, run_id, step_id, type, title, version, content, local_path, mime_type,
   producer, source_artifact_ids, hash, verification_status, is_deliverable, superseded_by,
   created_at, origin)
VALUES
  ('legacy-artifact', 'legacy-task', 'legacy-run', 'legacy-step', 'report', 'v8 旧交付物', 1,
   'legacy artifact body', NULL, 'text/markdown', 'legacy', NULL, 'legacy-hash', 'verified',
   1, NULL, '2026-07-01T08:02:00.000Z', 'legacy');

INSERT INTO evidence
  (id, task_id, artifact_id, source_type, locator, excerpt, verification_status, created_at)
VALUES
  ('legacy-evidence', 'legacy-task', 'legacy-artifact', 'file', 'legacy://source',
   'legacy excerpt', 'verified', '2026-07-01T08:02:30.000Z');

INSERT INTO run_events
  (task_id, run_id, step_id, type, payload, created_at)
VALUES
  ('legacy-task', 'legacy-run', NULL, 'delivered', '{"artifactCount":1}',
   '2026-07-01T08:03:00.000Z');

INSERT INTO run_events_archive
  (original_seq, task_id, run_id, step_id, type, payload, created_at, archived_at)
VALUES
  (9001, 'legacy-task', 'legacy-run', 'legacy-step', 'step-completed', '{"name":"read_input"}',
   '2026-07-01T08:01:00.000Z', '2026-07-01T08:04:00.000Z');

INSERT INTO schedules
  (id, name, goal, input_path, recipe_id, project_id, budget_usd, cadence, time_of_day,
   day_of_week, next_run_at, last_triggered_at, enabled, created_at, updated_at)
VALUES
  ('legacy-schedule', 'v8 旧自动化', '定期验证旧数据', '', 'file-edit-summarize', NULL, 1.5,
   'daily', '08:00', NULL, '2099-01-01T00:00:00.000Z', NULL, 1,
   '2026-07-01T07:00:00.000Z', '2026-07-01T07:00:00.000Z');

-- 当前代码完全不认识、但在旧库里合法存在的对象：一张手工审计表、一个手工索引、一个触发器。
-- 它们模拟用户或旧运维在本机库上留下的痕迹，迁移不得删除或改写。
CREATE TABLE legacy_task_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
INSERT INTO legacy_task_audit (id, task_id, changed_at)
VALUES (1, 'legacy-task', '2026-07-01T08:03:00.000Z');
CREATE INDEX idx_legacy_manual_task_created ON tasks(created_at);
CREATE TRIGGER trg_legacy_task_audit AFTER UPDATE ON tasks
BEGIN
  INSERT INTO legacy_task_audit (task_id, changed_at) VALUES (new.id, new.updated_at);
END;

COMMIT;
`

function semanticFingerprint(dbPath) {
  const objects = sql(
    dbPath,
    "SELECT type || '|' || name || '|' || COALESCE(tbl_name,'') || '|' || " +
      "REPLACE(REPLACE(COALESCE(sql,''), char(10), ' '), '  ', ' ') " +
      "FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
  )
  const counts = sql(
    dbPath,
    "SELECT name || '=' || (SELECT COUNT(*) FROM pragma_table_info(m.name)) FROM sqlite_master m " +
      "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  const normalized = `${objects}\n${counts}`.replace(/[ \t]+/g, ' ')
  return createHash('sha256').update(normalized).digest('hex')
}

function rowCounts(dbPath) {
  const tables = sql(
    dbPath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
    .split('\n')
    .filter(Boolean)
  const counts = {}
  for (const table of tables) {
    counts[table] = Number(sql(dbPath, `SELECT COUNT(*) FROM "${table}"`))
  }
  return counts
}

refuseUnsafeOutput()
const commit = verifyAnchor()

const root = mkdtempSync(join(tmpdir(), 'leanclaw-v8-fixture-'))
const worktree = join(root, 'worktree')
const home = join(root, 'home')
const data = join(root, 'data')
const temp = join(root, 'tmp')
for (const dir of [home, data, temp]) mkdirSync(dir, { recursive: true })

let worktreeAdded = false
try {
  log(`临时 worktree：${worktree}`)
  run('git', ['worktree', 'add', '--detach', worktree, commit], { cwd: repoRoot, stdio: 'inherit' })
  worktreeAdded = true

  log('用锚点提交自己的 lockfile 安装依赖（postinstall 会按 Electron ABI 重建 better-sqlite3）')
  run('npm', ['ci', '--no-audit', '--no-fund', '--foreground-scripts'], {
    cwd: worktree,
    stdio: 'inherit'
  })

  log('构建旧版入口')
  run('npm', ['run', 'build'], { cwd: worktree, stdio: 'inherit' })

  log('在隔离数据根启动旧 Runtime，由旧版 initDb() 真实创建 v8 数据库')
  const electron = join(worktree, 'node_modules', '.bin', 'electron')
  try {
    const output = execFileSync(electron, ['out/main/runtime.js'], {
      cwd: worktree,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        LEANCLAW_DATA_DIR: data,
        HOME: home,
        TMPDIR: temp,
        ELECTRON_RUN_AS_NODE: '1',
        ANTHROPIC_API_KEY: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    log(`旧 Runtime 输出：${output.trim() || '(空)'}`)
  } catch (error) {
    // 旧入口在没有 parentPort 且未设置 LEANCLAW_SMOKE 时以退出码 2 结束，属于预期路径
    if (error.status !== 2) throw error
    log('旧 Runtime 以预期退出码 2 结束（无 parentPort 分支）')
  }

  const generated = join(data, 'leanclaw.db')
  if (!existsSync(generated)) throw new Error('旧 Runtime 未创建数据库')
  const version = Number(sql(generated, 'SELECT version FROM schema_version'))
  if (version !== EXPECTED_VERSION) {
    throw new Error(`旧 Runtime 建库版本为 v${version}，不是 v${EXPECTED_VERSION}`)
  }
  log(`旧 Runtime 建库版本 v${version}`)

  sql(generated, SEED_SQL)
  sql(generated, 'PRAGMA wal_checkpoint(TRUNCATE);')
  const integrity = sql(generated, 'PRAGMA integrity_check;')
  if (integrity !== 'ok') throw new Error(`fixture 完整性检查失败：${integrity}`)

  mkdirSync(outDir, { recursive: true })
  const target = join(outDir, 'leanclaw.db')
  copyFileSync(generated, target)

  // 先做全部 sqlite 读取，再删除 WAL 旁路文件、最后算 sha256：
  // WAL 模式下任何读写连接关闭时都可能改动主库字节，checksum 必须是最终落盘状态。
  const fingerprint = semanticFingerprint(target)
  const counts = rowCounts(target)
  for (const suffix of ['-wal', '-shm']) rmSync(`${target}${suffix}`, { force: true })
  const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex')
  const electronVersion = JSON.parse(
    readFileSync(join(worktree, 'node_modules/electron/package.json'), 'utf8')
  ).version
  const manifest = {
    fixture_id: 'v8-old-binary',
    source_kind: 'synthetic-old-binary',
    schema_version: EXPECTED_VERSION,
    generated_at: new Date().toISOString().slice(0, 10),
    source_commit: commit,
    source_commit_short: SOURCE_COMMIT,
    generator: 'tests/fixtures/migrations/v8-old-binary/generate.mjs',
    generate_command: 'node tests/fixtures/migrations/v8-old-binary/generate.mjs',
    schema_created_by: '锚点提交自身构建产物 out/main/runtime.js 的 initDb()',
    rows_created_by: 'generate.mjs 的 SEED_SQL（公开合成数据，经 /usr/bin/sqlite3 写入旧库）',
    node_version: process.version,
    electron_version: electronVersion,
    platform: `${process.platform}-${process.arch}`,
    sha256,
    semantic_fingerprint_sha256: fingerprint,
    row_counts: counts,
    unknown_objects: [
      'legacy_task_audit（手工审计表）',
      'idx_legacy_manual_task_created（手工索引）',
      'trg_legacy_task_audit（手工触发器）'
    ],
    privacy: {
      real_user_database_read: false,
      contains_user_content: false,
      contains_credentials: false,
      note: '全部行由 SEED_SQL 生成；旧 Runtime 的 HOME/TMPDIR/LEANCLAW_DATA_DIR 均指向临时目录'
    },
    byte_reproducibility:
      'SQLite 二进制字节不保证逐字节可复现（页布局、freelist 与生成时间相关）；可复现的是 semantic_fingerprint_sha256 与 row_counts'
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  log(`fixture 写入 ${target}`)
  log(`sha256=${sha256}`)
  log(`semantic_fingerprint=${manifest.semantic_fingerprint_sha256}`)
} finally {
  if (worktreeAdded) {
    run('git', ['worktree', 'remove', '--force', worktree], { cwd: repoRoot, stdio: 'inherit' })
  }
  rmSync(root, { recursive: true, force: true })
  log('临时 worktree 与临时根已清理')
}
