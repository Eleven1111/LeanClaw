import { describe, expect, it } from 'vitest'
import { nextOccurrence, validateScheduleInput } from '../src/shared/schedule'

describe('nextOccurrence', () => {
  it('每日时间已过则排到次日，未过则仍是当天', () => {
    const morning = new Date(2026, 6, 13, 7, 0)
    const evening = new Date(2026, 6, 13, 9, 0)
    expect(nextOccurrence('daily', '08:00', morning).getDate()).toBe(13)
    expect(nextOccurrence('daily', '08:00', evening).getDate()).toBe(14)
  })

  it('工作日从周五越过周末到周一', () => {
    const fridayAfter = new Date(2026, 6, 17, 9, 0)
    const next = nextOccurrence('weekdays', '08:00', fridayAfter)
    expect(next.getDay()).toBe(1)
    expect(next.getDate()).toBe(20)
  })

  it('每周只落到指定星期', () => {
    const monday = new Date(2026, 6, 13, 9, 0)
    const next = nextOccurrence('weekly', '08:00', monday, 3)
    expect(next.getDay()).toBe(3)
    expect(next.getDate()).toBe(15)
  })
})

describe('validateScheduleInput', () => {
  it('拒绝非法时间、cadence 和缺少 weekly day', () => {
    expect(validateScheduleInput({ cadence: 'daily', timeOfDay: '25:00' }).ok).toBe(false)
    expect(validateScheduleInput({ cadence: 'monthly', timeOfDay: '08:00' }).ok).toBe(false)
    expect(validateScheduleInput({ cadence: 'weekly', timeOfDay: '08:00' }).ok).toBe(false)
  })
  it('接受工作日计划', () => {
    expect(validateScheduleInput({ cadence: 'weekdays', timeOfDay: '08:30' })).toEqual({
      ok: true, value: { cadence: 'weekdays', timeOfDay: '08:30', dayOfWeek: null }
    })
  })
})
