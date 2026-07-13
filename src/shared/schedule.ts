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
