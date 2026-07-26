import { describe, expect, it } from 'vitest'
import { MIGRATIONS, pendingMigrations, type Migration } from '../src/runtime/db'

const noop = (): void => undefined

describe('pendingMigrations（迁移框架）', () => {
  it('返回版本号大于当前值的迁移，按版本升序排列', () => {
    const migrations: Migration[] = [
      { version: 2, up: noop },
      { version: 1, up: noop },
      { version: 3, up: noop }
    ]
    const pending = pendingMigrations(1, migrations)
    expect(pending.map((m) => m.version)).toEqual([2, 3])
  })

  it('current 大于等于全部版本时返回空数组', () => {
    const migrations: Migration[] = [{ version: 1, up: noop }, { version: 2, up: noop }]
    expect(pendingMigrations(2, migrations)).toEqual([])
    expect(pendingMigrations(5, migrations)).toEqual([])
  })

  it('current 为 0 时返回全部迁移', () => {
    const migrations: Migration[] = [{ version: 1, up: noop }, { version: 2, up: noop }]
    expect(pendingMigrations(0, migrations).map((m) => m.version)).toEqual([1, 2])
  })

  it('项目表迁移保持在既有迁移之后', () => {
    expect(pendingMigrations(3, [{ version: 4, up: noop }]).map((m) => m.version)).toEqual([4])
  })

  it('版本重复时抛出异常', () => {
    const migrations: Migration[] = [
      { version: 1, up: noop },
      { version: 1, up: noop }
    ]
    expect(() => pendingMigrations(0, migrations)).toThrow(/严格递增/)
  })

  it('不修改传入的迁移数组（不可变）', () => {
    const migrations: Migration[] = [{ version: 2, up: noop }, { version: 1, up: noop }]
    const original = [...migrations]
    pendingMigrations(0, migrations)
    expect(migrations).toEqual(original)
  })

  it('产品 Phase 2 的迁移保持 v1–v13 连续递增', () => {
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
    ])
  })

  it('v13 为列表投影的每条热查询建立索引，且可重复执行', () => {
    const statements: string[] = []
    const database = {
      prepare: () => ({ all: () => [] }),
      exec(sql: string) {
        statements.push(sql)
      }
    }

    const v13 = MIGRATIONS.find((migration) => migration.version === 13)
    v13?.up(database as never)
    v13?.up(database as never)

    const sql = statements.join('\n')
    for (const target of [
      'run_events(task_id)',
      'run_events_archive(task_id)',
      'runs(task_id)',
      'approvals(task_id)',
      'andon_events(task_id)',
      'artifacts(task_id)',
      'evidence(task_id)',
      'verifications(run_id)',
      'model_calls(step_id)',
      'tool_calls(step_id)',
      'tasks(agent_id)',
      'tasks(schedule_id)',
      'schedules(agent_id)'
    ]) {
      expect(sql).toContain(target)
    }
    // 幂等：重复执行不会因索引已存在而失败
    expect(sql.match(/CREATE INDEX/g)?.length).toBe(26)
    expect(sql).not.toMatch(/CREATE INDEX(?! IF NOT EXISTS)/)
  })

  it('v11 给热表与归档表补 actor 字段且不伪造旧事件身份', () => {
    const columns = new Map([
      ['run_events', ['seq', 'task_id', 'type', 'payload', 'created_at']],
      ['run_events_archive', ['seq', 'task_id', 'type', 'payload', 'created_at']]
    ])
    const statements: string[] = []
    const database = {
      prepare(sql: string) {
        const table = sql.match(/PRAGMA table_info\(([^)]+)\)/)?.[1] ?? ''
        return {
          all: () => (columns.get(table) ?? []).map((name) => ({ name }))
        }
      },
      exec(sql: string) {
        statements.push(sql)
        const match = sql.match(/ALTER TABLE (\S+) ADD COLUMN (\S+)/)
        if (match) columns.get(match[1])?.push(match[2])
      }
    }

    MIGRATIONS.find((migration) => migration.version === 11)?.up(database as never)

    for (const table of ['run_events', 'run_events_archive']) {
      expect(columns.get(table)).toEqual(
        expect.arrayContaining(['actor_type', 'actor_id', 'actor_name_snapshot'])
      )
    }
    expect(statements).toHaveLength(6)
    expect(statements.every((statement) => !/DEFAULT|UPDATE/i.test(statement))).toBe(true)
  })

  it('v12 只增加 Automation 触发来源且不回填旧 Task', () => {
    const columns = ['id', 'schedule_id']
    const statements: string[] = []
    const database = {
      prepare(sql: string) {
        return {
          all: () => (
            sql.includes('PRAGMA table_info(tasks)')
              ? columns.map((name) => ({ name }))
              : []
          )
        }
      },
      exec(sql: string) {
        statements.push(sql)
        const column = sql.match(/ALTER TABLE tasks ADD COLUMN (\S+)/)?.[1]
        if (column) columns.push(column)
      }
    }

    MIGRATIONS.find((migration) => migration.version === 12)?.up(database as never)

    expect(columns).toContain('schedule_trigger_source')
    expect(statements).toEqual([
      'ALTER TABLE tasks ADD COLUMN schedule_trigger_source TEXT'
    ])
    expect(statements.every((statement) => !/DEFAULT|UPDATE/i.test(statement))).toBe(true)
  })
})
