import { getDb } from './db'

export interface StepDurationRow {
  recipeId: string
  idx: number
  startedAt: string
  endedAt: string
}

/** recipeId -> 步骤序号 -> 历史时长（毫秒）。 */
export type StepDurationIndex = Map<string, Map<number, number[]>>

const ROW_SQL = `SELECT r.recipe_id AS recipeId, s.idx AS idx,
                        s.started_at AS startedAt, s.ended_at AS endedAt
                 FROM steps s JOIN runs r ON r.id = s.run_id
                 WHERE s.started_at IS NOT NULL AND s.ended_at IS NOT NULL`

export function groupStepDurations(rows: readonly StepDurationRow[]): StepDurationIndex {
  const index: StepDurationIndex = new Map()
  for (const row of rows) {
    const started = Date.parse(row.startedAt)
    const ended = Date.parse(row.endedAt)
    if (!Number.isFinite(started) || !Number.isFinite(ended)) continue
    const byIdx = index.get(row.recipeId) ?? new Map<number, number[]>()
    const values = byIdx.get(row.idx) ?? []
    values.push(ended - started)
    byIdx.set(row.idx, values)
    index.set(row.recipeId, byIdx)
  }
  return index
}

export function stepDurationsFor(
  index: StepDurationIndex,
  recipeId: string
): Map<number, number[]> {
  return index.get(recipeId) ?? new Map<number, number[]>()
}

/**
 * 单任务入口（`getTask` 与任务推送）。列表页已改用 `listTaskSummaries` 的批量投影，
 * 不再需要"一次构建全 recipe 索引"的入口。
 */
export function queryRecipeStepDurations(recipeId: string): Map<number, number[]> {
  const rows = getDb()
    .prepare(`${ROW_SQL} AND r.recipe_id = ?`)
    .all(recipeId) as StepDurationRow[]
  return stepDurationsFor(groupStepDurations(rows), recipeId)
}
