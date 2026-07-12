import { describe, expect, it } from 'vitest'
import { pendingMigrations, type Migration } from '../src/runtime/db'

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
})
