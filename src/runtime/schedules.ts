import { getDb, now } from './db'
import { nextOccurrence, type ScheduleCadence } from '../shared/schedule'

export interface DueSchedule {
  id: string
  goal: string
  inputPath: string
  recipeId: string
  projectId: string | null
  agentId: string | null
  budgetUsd: number | null
}

type ScheduleRow = {
  id: string; goal: string; input_path: string; recipe_id: string; project_id: string | null;
  agent_id: string | null; budget_usd: number | null; cadence: ScheduleCadence;
  time_of_day: string; day_of_week: number | null
}

export async function runDueSchedules(
  trigger: (schedule: DueSchedule) => Promise<void>,
  at: Date = new Date()
): Promise<number> {
  const db = getDb()
  const rows = db.prepare(
    `SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at`
  ).all(at.toISOString()) as ScheduleRow[]
  for (const row of rows) {
    const claimed = db.transaction(() => {
      const current = db.prepare('SELECT * FROM schedules WHERE id = ?').get(row.id) as
        | (ScheduleRow & { enabled: number; next_run_at: string })
        | undefined
      if (!current?.enabled || current.next_run_at > at.toISOString()) return null
      const next = nextOccurrence(
        current.cadence,
        current.time_of_day,
        at,
        current.day_of_week
      )
      db.prepare('UPDATE schedules SET next_run_at=?, last_triggered_at=?, updated_at=? WHERE id=?')
        .run(next.toISOString(), at.toISOString(), now(), row.id)
      return current
    })()
    if (!claimed) continue
    await trigger({
      id: claimed.id,
      goal: claimed.goal,
      inputPath: claimed.input_path,
      recipeId: claimed.recipe_id,
      projectId: claimed.project_id,
      agentId: claimed.agent_id,
      budgetUsd: claimed.budget_usd
    })
  }
  return rows.length
}

export function startScheduleLoop(trigger: (schedule: DueSchedule) => Promise<void>): () => void {
  let running = false
  const tick = async (): Promise<void> => {
    if (running) return
    running = true
    try { await runDueSchedules(trigger) } finally { running = false }
  }
  void tick()
  const timer = setInterval(() => void tick(), Number(process.env.LEANCLAW_SCHEDULE_INTERVAL_MS ?? 30_000))
  timer.unref()
  return () => clearInterval(timer)
}
