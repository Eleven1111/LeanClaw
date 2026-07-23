import Database from 'better-sqlite3'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

let db: Database.Database | null = null
let dataDir = ''

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  default_recipe_id TEXT,
  default_budget_usd REAL,
  max_concurrent_runs INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  agent_name_snapshot TEXT,
  agent_instructions_snapshot TEXT,
  goal TEXT NOT NULL,
  brief TEXT,
  input_path TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  recipe_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  resume_step_index INTEGER,
  started_at TEXT,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  idx INTEGER NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  output_summary TEXT,
  started_at TEXT,
  ended_at TEXT,
  UNIQUE(run_id, idx)
);
CREATE TABLE IF NOT EXISTS model_calls (
  id TEXT PRIMARY KEY,
  step_id TEXT NOT NULL REFERENCES steps(id),
  model TEXT NOT NULL,
  input_chars INTEGER,
  output_chars INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  step_id TEXT NOT NULL REFERENCES steps(id),
  tool_id TEXT NOT NULL,
  tool_version TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_summary TEXT,
  status TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  approval_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT,
  local_path TEXT,
  mime_type TEXT,
  producer TEXT,
  source_artifact_ids TEXT,
  hash TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  is_deliverable INTEGER NOT NULL DEFAULT 0,
  superseded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  artifact_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  locator TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  artifact_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  action_desc TEXT NOT NULL,
  diff TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS andon_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_id TEXT,
  reason TEXT NOT NULL,
  impact TEXT NOT NULL,
  recommended_actions TEXT NOT NULL,
  resume_step_index INTEGER,
  status TEXT NOT NULL,
  chosen_action TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS run_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  run_id TEXT,
  step_id TEXT,
  type TEXT NOT NULL,
  payload TEXT,
  actor_type TEXT,
  actor_id TEXT,
  actor_name_snapshot TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_events_archive (
  original_seq INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT,
  step_id TEXT,
  type TEXT NOT NULL,
  payload TEXT,
  actor_type TEXT,
  actor_id TEXT,
  actor_name_snapshot TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  input_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  saved_instructions TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rule_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  banned_words TEXT NOT NULL DEFAULT '[]',
  min_length INTEGER NOT NULL DEFAULT 0,
  max_length INTEGER NOT NULL DEFAULT 20000,
  must_start_with TEXT NOT NULL DEFAULT '',
  required_headings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  goal TEXT NOT NULL,
  step_ids TEXT NOT NULL,
  rule_set_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  input_path TEXT NOT NULL DEFAULT '',
  recipe_id TEXT NOT NULL,
  project_id TEXT,
  agent_id TEXT,
  budget_usd REAL,
  cadence TEXT NOT NULL,
  time_of_day TEXT NOT NULL,
  day_of_week INTEGER,
  next_run_at TEXT NOT NULL,
  last_triggered_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
`

const SAMPLE_NOTES = `TPS 的核心不是看板，而是让问题在发生的瞬间显性化。
自働化（Jidoka）意味着机器在检测到异常时自动停止，而不是继续生产次品。
安灯（Andon）系统允许任何一名工人拉绳停线，这不是权限，而是义务。
准时化（Just-in-Time）要求只在需要的时候，按需要的量，生产需要的东西。
标准作业是改善的基线：没有标准，就无法定义什么是异常。
改善（Kaizen）不是运动式的大改革，而是每天进行的微小、可验证的调整。
现地现物（Genchi Genbutsu）要求管理者亲自到现场观察事实，而不是依赖报表。
LeanClaw 把这些原则移植到 AI 任务执行：异常停线、证据回溯、检查点恢复。
`

export interface Migration {
  version: number
  up(database: Database.Database): void
}

function hasColumn(database: Database.Database, table: string, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(database) {
      if (!hasColumn(database, 'artifacts', 'origin')) {
        database.exec('ALTER TABLE artifacts ADD COLUMN origin TEXT')
      }
    }
  },
  {
    version: 2,
    up(database) {
      if (!hasColumn(database, 'tasks', 'budget_usd')) {
        database.exec('ALTER TABLE tasks ADD COLUMN budget_usd REAL')
      }
    }
  },
  {
    version: 3,
    up(database) {
      if (!hasColumn(database, 'tasks', 'refine_instructions')) {
        database.exec('ALTER TABLE tasks ADD COLUMN refine_instructions TEXT')
      }
    }
  },
  {
    version: 4,
    up(database) {
      database.exec(`CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        saved_instructions TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
      if (!hasColumn(database, 'tasks', 'project_instructions_snapshot')) {
        database.exec('ALTER TABLE tasks ADD COLUMN project_instructions_snapshot TEXT')
      }
    }
  },
  {
    version: 5,
    up(database) {
      database.exec(`CREATE TABLE IF NOT EXISTS rule_sets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        banned_words TEXT NOT NULL DEFAULT '[]',
        min_length INTEGER NOT NULL DEFAULT 0,
        max_length INTEGER NOT NULL DEFAULT 20000,
        must_start_with TEXT NOT NULL DEFAULT '',
        required_headings TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
    }
  },
  {
    version: 6,
    up(database) {
      database.exec(`CREATE TABLE IF NOT EXISTS custom_recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        goal TEXT NOT NULL,
        step_ids TEXT NOT NULL,
        rule_set_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
    }
  },
  {
    version: 7,
    up(database) {
      database.exec(`CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        input_path TEXT NOT NULL DEFAULT '',
        recipe_id TEXT NOT NULL,
        project_id TEXT,
        budget_usd REAL,
        cadence TEXT NOT NULL,
        time_of_day TEXT NOT NULL,
        day_of_week INTEGER,
        next_run_at TEXT NOT NULL,
        last_triggered_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
      if (!hasColumn(database, 'tasks', 'schedule_id')) {
        database.exec('ALTER TABLE tasks ADD COLUMN schedule_id TEXT')
      }
    }
  },
  {
    version: 8,
    up(database) {
      database.exec(`CREATE TABLE IF NOT EXISTS run_events_archive (
        original_seq INTEGER PRIMARY KEY,
        task_id TEXT NOT NULL,
        run_id TEXT,
        step_id TEXT,
        type TEXT NOT NULL,
        payload TEXT,
        created_at TEXT NOT NULL,
        archived_at TEXT NOT NULL
      )`)
    }
  },
  {
    version: 9,
    up(database) {
      database.exec(`CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        default_recipe_id TEXT,
        default_budget_usd REAL,
        max_concurrent_runs INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
    }
  },
  {
    version: 10,
    up(database) {
      if (!hasColumn(database, 'tasks', 'agent_id')) {
        database.exec('ALTER TABLE tasks ADD COLUMN agent_id TEXT')
      }
      if (!hasColumn(database, 'tasks', 'agent_name_snapshot')) {
        database.exec('ALTER TABLE tasks ADD COLUMN agent_name_snapshot TEXT')
      }
      if (!hasColumn(database, 'tasks', 'agent_instructions_snapshot')) {
        database.exec('ALTER TABLE tasks ADD COLUMN agent_instructions_snapshot TEXT')
      }
      if (!hasColumn(database, 'schedules', 'agent_id')) {
        database.exec('ALTER TABLE schedules ADD COLUMN agent_id TEXT')
      }
    }
  },
  {
    version: 11,
    up(database) {
      for (const table of ['run_events', 'run_events_archive']) {
        if (!hasColumn(database, table, 'actor_type')) {
          database.exec(`ALTER TABLE ${table} ADD COLUMN actor_type TEXT`)
        }
        if (!hasColumn(database, table, 'actor_id')) {
          database.exec(`ALTER TABLE ${table} ADD COLUMN actor_id TEXT`)
        }
        if (!hasColumn(database, table, 'actor_name_snapshot')) {
          database.exec(`ALTER TABLE ${table} ADD COLUMN actor_name_snapshot TEXT`)
        }
      }
    }
  }
]

export function pendingMigrations(current: number, migrations: Migration[]): Migration[] {
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].version <= sorted[i - 1].version) {
      throw new Error(
        `迁移版本必须严格递增且不重复：${sorted[i - 1].version} -> ${sorted[i].version}`
      )
    }
  }
  return sorted.filter((m) => m.version > current)
}

function getSchemaVersion(database: Database.Database): number {
  const row = database.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined
  return row?.version ?? 0
}

function runMigrations(database: Database.Database): void {
  const count = database.prepare('SELECT COUNT(*) c FROM schema_version').get() as { c: number }
  if (count.c === 0) database.prepare('INSERT INTO schema_version (version) VALUES (0)').run()
  const pending = pendingMigrations(getSchemaVersion(database), MIGRATIONS)
  if (pending.length === 0) return
  const txn = database.transaction(() => {
    for (const m of pending) {
      m.up(database)
      database.prepare('UPDATE schema_version SET version = ?').run(m.version)
    }
  })
  txn()
}

export function initDb(dir: string): Database.Database {
  dataDir = dir
  mkdirSync(dir, { recursive: true })
  const ws = join(dir, 'workspace')
  mkdirSync(ws, { recursive: true })
  const sample = join(ws, 'notes.md')
  if (!existsSync(sample)) writeFileSync(sample, SAMPLE_NOTES, 'utf8')
  db = new Database(join(dir, 'leanclaw.db'))
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  runMigrations(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('数据库未初始化')
  return db
}

export function getDataDir(): string {
  return dataDir
}

export function getWorkspaceDir(): string {
  return join(dataDir, 'workspace')
}

export function getSamplePath(): string {
  return join(getWorkspaceDir(), 'notes.md')
}

export const now = (): string => new Date().toISOString()
export const uid = (): string => crypto.randomUUID()
