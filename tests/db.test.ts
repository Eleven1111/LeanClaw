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

  it('产品 Phase 2 的迁移保持 v1–v11 连续递增', () => {
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
    ])
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
})
