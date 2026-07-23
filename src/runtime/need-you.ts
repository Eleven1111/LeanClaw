import { getDb } from './db'
import {
  projectNeedYouCandidate,
  sortNeedYouItems,
  type NeedYouCandidate
} from '../shared/need-you'
import type { NeedYouItemType, NeedYouItemView } from '../shared/types'

interface NeedYouRow {
  id: string
  type: NeedYouItemType
  taskId: string
  taskGoal: string
  agentName: string | null
  detail: string
  createdAt: string
  sourceId: string | null
  recommendedActions: string | null
}

function parseRecommendedActions(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((action): action is string => typeof action === 'string')
      : []
  } catch {
    return []
  }
}

export function listNeedYouItems(): NeedYouItemView[] {
  const rows = getDb()
    .prepare(
      `SELECT
         'approval:' || a.id AS id,
         'approval' AS type,
         t.id AS taskId,
         t.goal AS taskGoal,
         t.agent_name_snapshot AS agentName,
         a.action_desc AS detail,
         a.requested_at AS createdAt,
         a.id AS sourceId,
         NULL AS recommendedActions
       FROM approvals a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.status = 'pending' AND t.status = 'awaiting_approval'

       UNION ALL

       SELECT
         CASE WHEN
           EXISTS (
             SELECT 1
             FROM run_events e
             WHERE e.type = 'andon-opened'
               AND json_extract(
                 CASE WHEN json_valid(e.payload) THEN e.payload ELSE '{}' END,
                 '$.andonId'
               ) = a.id
               AND json_extract(
                 CASE WHEN json_valid(e.payload) THEN e.payload ELSE '{}' END,
                 '$.category'
               ) = 'budget'
           )
           OR (
             a.reason LIKE '预算已用尽（$%/%）%'
             AND a.impact = '此前步骤的产物仍然有效；可追加预算后重试当前步骤。'
           )
           THEN 'budget:' ELSE 'andon:'
         END || a.id AS id,
         CASE WHEN
           EXISTS (
             SELECT 1
             FROM run_events e
             WHERE e.type = 'andon-opened'
               AND json_extract(
                 CASE WHEN json_valid(e.payload) THEN e.payload ELSE '{}' END,
                 '$.andonId'
               ) = a.id
               AND json_extract(
                 CASE WHEN json_valid(e.payload) THEN e.payload ELSE '{}' END,
                 '$.category'
               ) = 'budget'
           )
           OR (
             a.reason LIKE '预算已用尽（$%/%）%'
             AND a.impact = '此前步骤的产物仍然有效；可追加预算后重试当前步骤。'
           )
           THEN 'budget' ELSE 'andon'
         END AS type,
         t.id AS taskId,
         t.goal AS taskGoal,
         t.agent_name_snapshot AS agentName,
         a.reason ||
           CASE WHEN TRIM(a.impact) = '' THEN '' ELSE '；' || a.impact END AS detail,
         a.created_at AS createdAt,
         a.id AS sourceId,
         a.recommended_actions AS recommendedActions
       FROM andon_events a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.status = 'open' AND t.status = 'andon_open'

       UNION ALL

       SELECT
         'verification_failed:' || t.id AS id,
         'verification_failed' AS type,
         t.id AS taskId,
         t.goal AS taskGoal,
         t.agent_name_snapshot AS agentName,
         COALESCE(v.detail, '存在未通过的验证') AS detail,
         COALESCE(v.created_at, t.updated_at) AS createdAt,
         v.id AS sourceId,
         NULL AS recommendedActions
       FROM tasks t
       LEFT JOIN runs current_run ON current_run.id = (
         SELECT r1.id
         FROM runs r1
         WHERE r1.task_id = t.id
         ORDER BY r1.rowid DESC
         LIMIT 1
       )
       LEFT JOIN verifications v ON v.id = (
         SELECT v2.id
         FROM verifications v2
         WHERE v2.run_id = current_run.id AND v2.status = 'failed'
         ORDER BY v2.created_at DESC, v2.id
         LIMIT 1
       )
       WHERE t.status = 'verification_failed'

       UNION ALL

       SELECT
         'blocked:' || t.id AS id,
         'blocked' AS type,
         t.id AS taskId,
         t.goal AS taskGoal,
         t.agent_name_snapshot AS agentName,
         '执行失败，需要打开任务查看上下文并决定下一步。' AS detail,
         t.updated_at AS createdAt,
         NULL AS sourceId,
         NULL AS recommendedActions
       FROM tasks t
       WHERE t.status = 'failed'`
    )
    .all() as NeedYouRow[]

  return sortNeedYouItems(
    rows.map((row) =>
      projectNeedYouCandidate({
        ...row,
        recommendedActions: parseRecommendedActions(row.recommendedActions)
      } satisfies NeedYouCandidate)
    )
  )
}
