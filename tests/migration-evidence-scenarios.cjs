// T06 迁移证据场景集。由 tests/migration-evidence.mjs 在
// `ELECTRON_RUN_AS_NODE=1 electron` 下启动，因此这里的 better-sqlite3 是真实原生模块。
//
// 每个场景独立建库、独立断言，最后输出证据台账。任何一条失败 -> 退出码 1。
'use strict'

const Database = require('better-sqlite3')
const { copyFileSync, existsSync, mkdirSync, rmSync } = require('fs')
const { join } = require('path')

const bundlePath = required('LEANCLAW_MIGRATION_DB_BUNDLE')
const isolationPath = required('LEANCLAW_MIGRATION_ISOLATION_BUNDLE')
const scratch = required('LEANCLAW_EVIDENCE_SCRATCH')
const fixturePath = required('LEANCLAW_MIGRATION_FIXTURE')

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`迁移证据 harness 缺少环境变量 ${name}`)
  return value
}

// 隔离契约必须在建立任何数据库之前失败关闭（T05 契约）。
require(isolationPath).assertTestIsolationEnvironment()
const dbModule = require(bundlePath)

mkdirSync(scratch, { recursive: true })

const LATEST = 13
const LEGACY_TABLES = [
  'tasks',
  'runs',
  'steps',
  'artifacts',
  'evidence',
  'run_events',
  'run_events_archive',
  'schedules'
]
const V13_INDEXES = [
  'idx_run_events_task',
  'idx_run_events_archive_task',
  'idx_runs_task',
  'idx_approvals_task',
  'idx_andon_events_task',
  'idx_artifacts_task',
  'idx_evidence_task',
  'idx_verifications_run',
  'idx_model_calls_step',
  'idx_tool_calls_step',
  'idx_tasks_agent',
  'idx_tasks_schedule',
  'idx_schedules_agent'
]
// fixture 里由旧库人工创建、当前代码完全不认识的合法对象。
const UNKNOWN_OBJECTS = ['legacy_task_audit', 'idx_legacy_manual_task_created', 'trg_legacy_task_audit']

function out(line) {
  process.stdout.write(`${line}\n`)
}

function requireExport(name) {
  const value = dbModule[name]
  if (typeof value !== 'function') {
    throw new Error(`契约缺失：src/runtime/db.ts 未导出可调用的 ${name}()`)
  }
  return value
}

function dir(name) {
  const target = join(scratch, name)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  return target
}

function fixtureDir(name) {
  if (!existsSync(fixturePath)) {
    throw new Error(`fixture 缺失：${fixturePath}（需要先生成 v8 old-binary fixture）`)
  }
  const target = dir(name)
  copyFileSync(fixturePath, join(target, 'leanclaw.db'))
  return target
}

function open(path, options) {
  return new Database(path, options || {})
}

function closeCurrent() {
  try {
    dbModule.getDb().close()
  } catch {
    // 未初始化或已关闭：无需处理
  }
}

function initAt(target) {
  closeCurrent()
  return dbModule.initDb(target)
}

function normalizeSql(sql) {
  if (!sql) return ''
  return sql.replace(/IF NOT EXISTS/gi, '').replace(/"/g, '').replace(/\s+/g, ' ').trim()
}

// 语义结构指纹。刻意排除的非语义噪音：
// - 列顺序（ALTER TABLE 只能追加，升级库与新库顺序必然不同）；
// - CREATE TABLE 原文（同一列集合在 SCHEMA 与 migration 中写法不同）；
// - `sqlite_autoindex_*` 的自动编号（保留 unique/列组合本身）；
// - `sqlite_%` 内部对象（如 sqlite_sequence）。
function structure(dbPath) {
  const database = open(dbPath, { readonly: true })
  try {
    const master = database
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
      )
      .all()
    const tables = master
      .filter((row) => row.type === 'table')
      .map((row) => row.name)
      .sort()
    const columns = {}
    const indexes = {}
    for (const table of tables) {
      columns[table] = database
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map(
          (column) =>
            `${column.name}|type=${column.type}|notnull=${column.notnull}` +
            `|default=${column.dflt_value === null ? 'NULL' : column.dflt_value}|pk=${column.pk}`
        )
        .sort()
      indexes[table] = database
        .prepare(`PRAGMA index_list("${table}")`)
        .all()
        .map((index) => {
          const cols = database
            .prepare(`PRAGMA index_info("${index.name}")`)
            .all()
            .map((column) => column.name)
            .join(',')
          const name = index.name.startsWith('sqlite_autoindex') ? '<auto>' : index.name
          return `${name}|unique=${index.unique}|origin=${index.origin}|(${cols})`
        })
        .sort()
    }
    const triggers = master
      .filter((row) => row.type === 'trigger')
      .map((row) => `${row.name}|${row.tbl_name}|${normalizeSql(row.sql)}`)
      .sort()
    const views = master
      .filter((row) => row.type === 'view')
      .map((row) => `${row.name}|${normalizeSql(row.sql)}`)
      .sort()
    return { tables, columns, indexes, triggers, views }
  } finally {
    database.close()
  }
}

function objectSql(dbPath, name) {
  const database = open(dbPath, { readonly: true })
  try {
    const row = database
      .prepare('SELECT type, sql FROM sqlite_master WHERE name = ?')
      .get(name)
    return row ? `${row.type}|${normalizeSql(row.sql)}` : null
  } finally {
    database.close()
  }
}

function schemaVersionRows(dbPath) {
  const database = open(dbPath, { readonly: true })
  try {
    return database.prepare('SELECT version FROM schema_version').all().map((row) => row.version)
  } finally {
    database.close()
  }
}

function dataSnapshot(dbPath) {
  const database = open(dbPath, { readonly: true })
  try {
    const counts = {}
    for (const table of LEGACY_TABLES) {
      counts[table] = database.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c
    }
    const task = database
      .prepare('SELECT goal, status, budget_usd, schedule_id, updated_at FROM tasks WHERE id = ?')
      .get('legacy-task')
    const artifact = database
      .prepare('SELECT hash, title, is_deliverable FROM artifacts WHERE id = ?')
      .get('legacy-artifact')
    const event = database
      .prepare('SELECT type, payload FROM run_events WHERE task_id = ? ORDER BY seq LIMIT 1')
      .get('legacy-task')
    const schedule = database
      .prepare('SELECT next_run_at, cadence, enabled FROM schedules WHERE id = ?')
      .get('legacy-schedule')
    return { counts, task, artifact, event, schedule }
  } finally {
    database.close()
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${message}\n  实际：${a}\n  期望：${b}`)
}

function structureDelta(left, right) {
  const deltas = []
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) deltas.push(key)
  }
  return deltas
}

function expectMigrationError(fn, code, message) {
  let error
  try {
    fn()
  } catch (caught) {
    error = caught
  }
  assert(error, `${message}：未抛出任何错误`)
  assert(
    error.code === code,
    `${message}：错误码应为 ${code}，实际为 ${String(error.code)}（${error.message}）`
  )
  return error
}

// 只改写版本台账：先用当前代码正常建库，再把 schema_version 换成待验证的异常状态。
// 这样版本台账类场景不依赖任何新导出，可以直接在旧实现上取得真实失败输出。
function seedLedger(target, ledgerSql) {
  initAt(target)
  closeCurrent()
  const database = open(join(target, 'leanclaw.db'))
  try {
    database.prepare('DELETE FROM schema_version').run()
    if (ledgerSql) database.exec(ledgerSql)
    database.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    database.close()
  }
}

// 构造真正的 N-1 夹具：最新 SCHEMA + v1..N-1 的已发布 migration，刻意不执行 v13。
// 注意：SCHEMA 本身不是"最新结构"的完整定义（例如 tasks.schedule_id 只由 v7 迁移添加），
// 所以只执行 SCHEMA 再把版本标成 12 会得到一个现实中不存在的库。
function seedSchemaOnly(target, version) {
  const createSchema = requireExport('createSchema')
  const applyMigrations = requireExport('applyMigrations')
  const database = open(join(target, 'leanclaw.db'))
  try {
    database.pragma('journal_mode = WAL')
    createSchema(database)
    applyMigrations(
      database,
      dbModule.MIGRATIONS.filter((migration) => migration.version <= version)
    )
    assertEqual(
      database.prepare('SELECT version FROM schema_version').all().map((row) => row.version),
      [version],
      `N-1 夹具应停在 v${version}`
    )
  } finally {
    database.close()
  }
}

const results = []

function scenario(name, fn) {
  try {
    const detail = fn()
    results.push({ name, ok: true, detail: detail || '' })
    out(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    results.push({ name, ok: false, detail: error.message })
    out(`FAIL  ${name} — ${error.message}`)
  } finally {
    closeCurrent()
  }
}

let freshStructure = null
let upgradedStructure = null

scenario('empty-dir-creates-latest', () => {
  const target = dir('fresh')
  initAt(target)
  const dbPath = join(target, 'leanclaw.db')
  closeCurrent()
  assertEqual(schemaVersionRows(dbPath), [LATEST], '空目录建库后 schema_version 必须恰好一行且为最新版本')
  freshStructure = structure(dbPath)
  for (const index of V13_INDEXES) {
    assert(
      Object.values(freshStructure.indexes).some((list) =>
        list.some((entry) => entry.startsWith(`${index}|`))
      ),
      `空目录建库缺少 v13 索引 ${index}`
    )
  }
  return `version=${LATEST}, 表 ${freshStructure.tables.length} 个`
})

scenario('n-minus-1-upgrade', () => {
  const target = dir('n-minus-1')
  seedSchemaOnly(target, LATEST - 1)
  const dbPath = join(target, 'leanclaw.db')
  const before = structure(dbPath)
  initAt(target)
  closeCurrent()
  assertEqual(schemaVersionRows(dbPath), [LATEST], 'N-1 升级后版本必须为最新')
  const after = structure(dbPath)
  assert(
    Object.values(before.indexes).every((list) =>
      list.every((entry) => !V13_INDEXES.some((index) => entry.startsWith(`${index}|`)))
    ),
    'N-1 夹具不应预先带有 v13 索引，否则无法证明 v13 迁移创建了它们'
  )
  for (const index of V13_INDEXES) {
    assert(
      Object.values(after.indexes).some((list) =>
        list.some((entry) => entry.startsWith(`${index}|`))
      ),
      `N-1 升级后缺少 v13 索引 ${index}`
    )
  }
  return `v${LATEST - 1} -> v${LATEST}，13 个索引由 v13 迁移创建`
})

scenario('old-binary-fixture-upgrade', () => {
  const target = fixtureDir('fixture-upgrade')
  const dbPath = join(target, 'leanclaw.db')
  assertEqual(schemaVersionRows(dbPath), [8], 'fixture 起始版本必须是 v8')
  const before = dataSnapshot(dbPath)
  initAt(target)
  closeCurrent()
  assertEqual(schemaVersionRows(dbPath), [LATEST], 'fixture 升级后版本必须为最新')
  const after = dataSnapshot(dbPath)
  assertEqual(after.counts, before.counts, 'fixture 升级不得改变任何历史行数')
  assertEqual(after.task, before.task, 'fixture 升级不得改变 Task 关键值')
  assertEqual(after.artifact, before.artifact, 'fixture 升级不得改变 Artifact 关键值')
  assertEqual(after.event, before.event, 'fixture 升级不得改变历史事件')
  assertEqual(after.schedule, before.schedule, 'fixture 升级不得改变 Automation 关键值')

  const database = open(dbPath, { readonly: true })
  try {
    const migrated = database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM agents) AS agents,
           (SELECT agent_id FROM tasks WHERE id = 'legacy-task') AS taskAgentId,
           (SELECT agent_name_snapshot FROM tasks WHERE id = 'legacy-task') AS taskAgentName,
           (SELECT schedule_trigger_source FROM tasks WHERE id = 'legacy-task') AS triggerSource,
           (SELECT agent_id FROM schedules WHERE id = 'legacy-schedule') AS scheduleAgentId,
           (SELECT actor_type FROM run_events WHERE task_id = 'legacy-task' LIMIT 1) AS actorType,
           (SELECT actor_id FROM run_events WHERE task_id = 'legacy-task' LIMIT 1) AS actorId,
           (SELECT actor_name_snapshot FROM run_events WHERE task_id = 'legacy-task' LIMIT 1)
             AS actorName`
      )
      .get()
    assertEqual(
      migrated,
      {
        agents: 0,
        taskAgentId: null,
        taskAgentName: null,
        triggerSource: null,
        scheduleAgentId: null,
        actorType: null,
        actorId: null,
        actorName: null
      },
      '迁移不得为无法证明的历史事实编造 actor/agent/触发来源'
    )
  } finally {
    database.close()
  }
  upgradedStructure = structure(dbPath)
  return `v8 -> v${LATEST}，行数与关键值保持`
})

scenario('schema-fingerprint-parity', () => {
  assert(freshStructure, '缺少空目录建库指纹')
  assert(upgradedStructure, '缺少 fixture 升级后指纹')
  const upgraded = {
    tables: upgradedStructure.tables.filter((table) => !UNKNOWN_OBJECTS.includes(table)),
    columns: { ...upgradedStructure.columns },
    indexes: {},
    triggers: upgradedStructure.triggers.filter(
      (entry) => !UNKNOWN_OBJECTS.some((name) => entry.startsWith(`${name}|`))
    ),
    views: upgradedStructure.views
  }
  for (const table of UNKNOWN_OBJECTS) delete upgraded.columns[table]
  for (const [table, list] of Object.entries(upgradedStructure.indexes)) {
    if (UNKNOWN_OBJECTS.includes(table)) continue
    upgraded.indexes[table] = list.filter(
      (entry) => !UNKNOWN_OBJECTS.some((name) => entry.startsWith(`${name}|`))
    )
  }
  const deltas = structureDelta(freshStructure, upgraded)
  assert(
    deltas.length === 0,
    `新库与升级库的关键结构不一致：${deltas.join(', ')}\n  新库：${JSON.stringify(
      pick(freshStructure, deltas)
    )}\n  升级库：${JSON.stringify(pick(upgraded, deltas))}`
  )
  return `表/列/索引/触发器/视图全等（已剔除 fixture 的未知对象与自动生成名称）`
})

function pick(source, keys) {
  const result = {}
  for (const key of keys) result[key] = source[key]
  return result
}

scenario('unknown-objects-preserved', () => {
  const target = fixtureDir('unknown-objects')
  const dbPath = join(target, 'leanclaw.db')
  const before = {}
  for (const name of UNKNOWN_OBJECTS) {
    before[name] = objectSql(dbPath, name)
    assert(before[name], `fixture 未包含未知对象 ${name}`)
  }
  const auditBefore = (() => {
    const database = open(dbPath, { readonly: true })
    try {
      return database.prepare('SELECT COUNT(*) AS c FROM legacy_task_audit').get().c
    } finally {
      database.close()
    }
  })()
  initAt(target)
  closeCurrent()
  for (const name of UNKNOWN_OBJECTS) {
    assertEqual(objectSql(dbPath, name), before[name], `未知对象 ${name} 在升级后必须语义不变`)
  }
  const database = open(dbPath, { readonly: true })
  try {
    assertEqual(
      database.prepare('SELECT COUNT(*) AS c FROM legacy_task_audit').get().c,
      auditBefore,
      '未知历史表的行数不得被迁移改动'
    )
  } finally {
    database.close()
  }
  return `${UNKNOWN_OBJECTS.length} 个未知对象（表/索引/触发器）保持`
})

scenario('repeat-startup-idempotent', () => {
  const target = fixtureDir('repeat-startup')
  const dbPath = join(target, 'leanclaw.db')
  initAt(target)
  closeCurrent()
  const first = { data: dataSnapshot(dbPath), structure: structure(dbPath) }
  initAt(target)
  closeCurrent()
  const second = { data: dataSnapshot(dbPath), structure: structure(dbPath) }
  initAt(target)
  closeCurrent()
  const third = { data: dataSnapshot(dbPath), structure: structure(dbPath) }
  assertEqual(second, first, '第二次启动改变了数据或结构')
  assertEqual(third, first, '第三次启动改变了数据或结构')
  assertEqual(schemaVersionRows(dbPath), [LATEST], '重复启动后 schema_version 必须仍是恰好一行')
  for (const name of UNKNOWN_OBJECTS) {
    assert(objectSql(dbPath, name), `重复启动后未知对象 ${name} 被删除`)
  }
  return '连续三次启动后版本、结构、行数、关键值与未知对象不变'
})

scenario('newer-database-fails-closed', () => {
  // 夹具在独立目录里构造，被拒绝的打开动作发生在另一个目录，
  // 这样才能证明失败不会把模块状态切到被拒绝的数据根。
  const seed = dir('too-new-seed')
  seedLedger(seed, `INSERT INTO schema_version (version) VALUES (${LATEST + 1});`)
  const target = dir('too-new')
  copyFileSync(join(seed, 'leanclaw.db'), join(target, 'leanclaw.db'))
  const error = expectMigrationError(
    () => initAt(target),
    'schema-too-new',
    '高于当前程序版本的数据库必须失败关闭'
  )
  assert(
    /schema_version/.test(error.message),
    `失败关闭的错误信息必须可识别，实际为：${error.message}`
  )
  assert(
    dbModule.getDataDir() !== target,
    '失败关闭后模块状态不得切换到被拒绝的数据根，否则调用方会把拒绝当成成功'
  )
  closeCurrent()
  assertEqual(
    schemaVersionRows(join(target, 'leanclaw.db')),
    [LATEST + 1],
    '被拒绝的数据库不得被写入或部分迁移'
  )
  return `v${LATEST + 1} 被拒绝：${error.code}`
})

scenario('ledger-multiple-rows-fails-closed', () => {
  const target = dir('ledger-multi')
  seedLedger(
    target,
    'INSERT INTO schema_version (version) VALUES (8); INSERT INTO schema_version (version) VALUES (13);'
  )
  const error = expectMigrationError(
    () => initAt(target),
    'ledger-not-single-row',
    'schema_version 多于一行必须失败关闭'
  )
  return `2 行版本台账被拒绝：${error.code}`
})

scenario('ledger-invalid-version-fails-closed', () => {
  for (const [label, sql] of [
    ['文本', "INSERT INTO schema_version (version) VALUES ('not-a-version');"],
    ['负数', 'INSERT INTO schema_version (version) VALUES (-1);'],
    ['小数', 'INSERT INTO schema_version (version) VALUES (12.5);']
  ]) {
    const target = dir(`ledger-invalid-${label}`)
    seedLedger(target, sql)
    expectMigrationError(
      () => initAt(target),
      'ledger-invalid-version',
      `schema_version 为${label}时必须失败关闭`
    )
  }
  return '文本、负数、小数版本号全部被拒绝'
})

scenario('ledger-zero-rows-bootstraps', () => {
  const target = dir('ledger-empty')
  seedLedger(target, '')
  const dbPath = join(target, 'leanclaw.db')
  assertEqual(schemaVersionRows(dbPath), [], '夹具应先具备 0 行版本台账')
  initAt(target)
  closeCurrent()
  assertEqual(schemaVersionRows(dbPath), [LATEST], '0 行版本台账必须按 bootstrap 规则补齐到最新')
  return '0 行台账 -> 单行最新版本'
})

scenario('failing-migration-rolls-back', () => {
  const applyMigrations = requireExport('applyMigrations')
  const target = fixtureDir('rollback')
  const dbPath = join(target, 'leanclaw.db')
  const database = initAt(target)
  const before = { data: dataSnapshot(dbPath), version: schemaVersionRows(dbPath) }
  const injected = [
    {
      version: LATEST + 1,
      up(connection) {
        connection.exec('CREATE TABLE t06_injected (id TEXT PRIMARY KEY)')
        connection.prepare('INSERT INTO t06_injected (id) VALUES (?)').run('written-before-failure')
        connection.prepare('UPDATE tasks SET goal = ? WHERE id = ?').run('MUTATED', 'legacy-task')
      }
    },
    {
      version: LATEST + 2,
      up() {
        throw new Error('T06 固定注入失败点')
      }
    }
  ]
  let error
  try {
    applyMigrations(database, injected)
  } catch (caught) {
    error = caught
  }
  assert(error, '注入的失败迁移必须向上抛出，不得被静默吞掉')
  assert(
    /T06 固定注入失败点/.test(error.message),
    `失败原因必须保留，实际为：${error.message}`
  )
  assert(
    database.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 't06_injected'").get().c ===
      0,
    '失败迁移已写入的表必须整体回滚'
  )
  closeCurrent()
  assertEqual(schemaVersionRows(dbPath), before.version, '失败迁移后 schema_version 必须回到迁移前')
  assertEqual(dataSnapshot(dbPath), before.data, '失败迁移后数据必须回到迁移前')
  return `注入点 v${LATEST + 2} 抛错，v${LATEST + 1} 的表/数据写入全部回滚`
})

scenario('recovery-after-rollback-is-forward-only', () => {
  const target = fixtureDir('rollback-recovery')
  const dbPath = join(target, 'leanclaw.db')
  const database = initAt(target)
  const baseline = dataSnapshot(dbPath)
  try {
    requireExport('applyMigrations')(database, [
      {
        version: LATEST + 1,
        up(connection) {
          connection.exec('CREATE TABLE t06_recovery_probe (id TEXT PRIMARY KEY)')
          throw new Error('T06 回滚后恢复探针')
        }
      }
    ])
  } catch {
    // 预期失败：本场景验证失败之后仍可正常向前启动
  }
  closeCurrent()
  initAt(target)
  closeCurrent()
  assertEqual(schemaVersionRows(dbPath), [LATEST], '回滚后重新启动必须仍停在最新已发布版本')
  assertEqual(dataSnapshot(dbPath), baseline, '回滚后重新启动不得丢数据')
  for (const name of UNKNOWN_OBJECTS) {
    assert(objectSql(dbPath, name), `回滚后重新启动删除了未知对象 ${name}`)
  }
  return '回滚 -> 重新启动：版本、数据、未知对象均完好，无需降级迁移'
})

scenario('published-migration-versions-unchanged', () => {
  const versions = dbModule.MIGRATIONS.map((migration) => migration.version)
  assertEqual(
    versions,
    Array.from({ length: LATEST }, (_, index) => index + 1),
    '已发布的 v1–v13 迁移不得重编号或增删'
  )
  return `v1–v${LATEST} 连续且未重编号`
})

const failed = results.filter((result) => !result.ok)
out('')
out(`迁移证据台账：${results.length - failed.length}/${results.length} PASS`)
if (failed.length) {
  out(`失败场景：${failed.map((result) => result.name).join(', ')}`)
  process.exit(1)
}
process.exit(0)
