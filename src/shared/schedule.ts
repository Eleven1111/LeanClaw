export type ScheduleCadence = 'daily' | 'weekdays' | 'weekly'

export function nextOccurrence(
  cadence: ScheduleCadence,
  timeOfDay: string,
  after: Date,
  dayOfWeek: number | null = null
): Date {
  const [hour, minute] = timeOfDay.split(':').map(Number)
  const candidate = new Date(after)
  candidate.setSeconds(0, 0)
  candidate.setHours(hour, minute, 0, 0)
  if (candidate.getTime() <= after.getTime()) candidate.setDate(candidate.getDate() + 1)
  if (cadence === 'weekdays') {
    while (candidate.getDay() === 0 || candidate.getDay() === 6) candidate.setDate(candidate.getDate() + 1)
  } else if (cadence === 'weekly') {
    const target = dayOfWeek as number
    while (candidate.getDay() !== target) candidate.setDate(candidate.getDate() + 1)
  }
  return candidate
}

export type ScheduleValidation =
  | { ok: true; value: { cadence: ScheduleCadence; timeOfDay: string; dayOfWeek: number | null } }
  | { ok: false; detail: string }

export function validateScheduleInput(input: {
  cadence: string
  timeOfDay: string
  dayOfWeek?: number | null
}): ScheduleValidation {
  if (!['daily', 'weekdays', 'weekly'].includes(input.cadence)) return { ok: false, detail: '不支持的重复频率' }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.timeOfDay)) return { ok: false, detail: '时间必须是 HH:mm' }
  const cadence = input.cadence as ScheduleCadence
  const day = input.dayOfWeek ?? null
  if (cadence === 'weekly' && (!Number.isInteger(day) || (day as number) < 0 || (day as number) > 6)) {
    return { ok: false, detail: '每周计划必须选择星期' }
  }
  return { ok: true, value: { cadence, timeOfDay: input.timeOfDay, dayOfWeek: cadence === 'weekly' ? day : null } }
}

/**
 * `last_triggered_at` 记录的是**认领**时刻，不是成功。认领会推进 `next_run_at`（避免坏计划
 * 每个 tick 热重试），所以触发失败时卡片看起来和正常周期一样——这就是「无提示跳过」。
 *
 * 用既有两列判断这次到期触发有没有产出 Task，不新建平行事实表：认领时刻晚于最新 Task 的
 * 创建时刻，说明认领之后没有 Task 落地。同毫秒不判失败（成功路径的 Task 只会更晚或同刻）。
 */
export function lastTriggerProducedNoTask(schedule: {
  lastTriggeredAt: string | null
  lastTaskCreatedAt: string | null
}): boolean {
  if (!schedule.lastTriggeredAt) return false
  if (!schedule.lastTaskCreatedAt) return true
  return schedule.lastTriggeredAt > schedule.lastTaskCreatedAt
}
