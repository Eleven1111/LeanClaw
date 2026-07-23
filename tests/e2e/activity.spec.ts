import { execFileSync } from 'child_process'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('Activity actor 快照、分页和归档边界保持可信', async () => {
  launched = await launchApp()
  const { window, dataDir } = launched

  const seeded = await window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const agent = (await api.rpc({
      method: 'saveAgent',
      name: 'Activity Agent V1',
      description: '验证事件 actor 快照',
      instructions: '只输出可审计结果',
      defaultRecipeId: 'deep-research',
      defaultBudgetUsd: 2,
      maxConcurrentRuns: 1
    })) as { id: string }
    const task = (await api.rpc({
      method: 'createTask',
      goal: '验证 Activity 数据契约',
      inputPath: '',
      recipeId: 'deep-research',
      agentId: agent.id
    })) as { id: string }
    await api.rpc({ method: 'startTask', taskId: task.id })
    return { agentId: agent.id, taskId: task.id }
  })

  await expect
    .poll(
      () =>
        window.evaluate(async (taskId) => {
          const api = (
            globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
          ).api
          return (
            (await api.rpc({ method: 'getTask', taskId })) as {
              status: string
            }
          ).status
        }, seeded.taskId),
      { timeout: 30_000 }
    )
    .toBe('awaiting_approval')

  await window.evaluate(
    async ({ agentId, taskId }) => {
      const api = (
        globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
      ).api
      const task = (await api.rpc({ method: 'getTask', taskId })) as {
        approvals: { id: string; status: string }[]
      }
      const approval = task.approvals.find((item) => item.status === 'pending')
      if (!approval) throw new Error('缺少待处理 Approval')
      await api.rpc({
        method: 'resolveApproval',
        approvalId: approval.id,
        decision: 'approved'
      })
      await api.rpc({
        method: 'saveAgent',
        id: agentId,
        name: 'Activity Agent V2',
        description: '已改名',
        instructions: '新指令',
        defaultRecipeId: 'deep-research',
        defaultBudgetUsd: 2,
        maxConcurrentRuns: 1
      })
    },
    seeded
  )

  await expect
    .poll(
      () =>
        window.evaluate(async (taskId) => {
          const api = (
            globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
          ).api
          return (
            (await api.rpc({ method: 'getTask', taskId })) as {
              status: string
            }
          ).status
        }, seeded.taskId),
      { timeout: 30_000 }
    )
    .toBe('delivered')

  execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `WITH RECURSIVE n(x) AS (
       SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 50
     )
     INSERT INTO run_events
       (task_id, type, payload, actor_type, actor_name_snapshot, created_at)
     SELECT '${seeded.taskId}', 'future-secret-event',
            '{"secret":"sk-unknown-event"}', 'system', '系统',
            '2026-07-23T20:00:00.000Z'
     FROM n`
  ])

  const activity = await window.evaluate(async (taskId) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const all = (await api.rpc({
      method: 'getTaskActivity',
      taskId,
      limit: 200
    })) as {
      seq: number
      actorType: string
      actorId: string | null
      actorName: string
      title: string
    }[]
    const defaultPage = (await api.rpc({
      method: 'getTaskActivity',
      taskId
    })) as { seq: number; title: string }[]
    const latest = (await api.rpc({
      method: 'getTaskActivity',
      taskId,
      limit: 2
    })) as { seq: number }[]
    const earlier = (await api.rpc({
      method: 'getTaskActivity',
      taskId,
      limit: 2,
      beforeSeq: latest[0]?.seq
    })) as { seq: number }[]
    let invalidLimit = ''
    try {
      await api.rpc({ method: 'getTaskActivity', taskId, limit: 201 })
    } catch (error) {
      invalidLimit = (error as Error).message
    }
    return { all, defaultPage, latest, earlier, invalidLimit }
  }, seeded.taskId)

  expect(activity.defaultPage.length).toBeGreaterThan(0)
  expect(JSON.stringify(activity.defaultPage)).not.toContain('sk-unknown-event')
  const allSeqs = activity.all.map((item) => item.seq)
  expect(allSeqs).toEqual([...allSeqs].sort((left, right) => left - right))
  expect(activity.latest).toHaveLength(2)
  expect(activity.earlier).toHaveLength(2)
  expect(
    activity.latest.some((latest) =>
      activity.earlier.some((earlier) => earlier.seq === latest.seq)
    )
  ).toBe(false)
  expect(activity.invalidLimit).toContain('1–200')
  expect(activity.all).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actorType: 'user',
        actorName: '你',
        title: '你创建了任务'
      }),
      expect.objectContaining({
        actorType: 'agent',
        actorId: seeded.agentId,
        actorName: 'Activity Agent V1'
      })
    ])
  )
  expect(JSON.stringify(activity.all)).not.toContain('新指令')

  await window.evaluate(async (taskId) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    await api.rpc({ method: 'archiveTask', taskId })
  }, seeded.taskId)

  const archivedFeed = await window.evaluate(async (taskId) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    return api.rpc({ method: 'getTaskActivity', taskId, limit: 200 })
  }, seeded.taskId)
  expect(archivedFeed).toEqual([
    expect.objectContaining({
      kind: 'archive',
      actorType: 'system',
      title: '历史活动已压缩'
    })
  ])

  const archivedActors = execFileSync(
    '/usr/bin/sqlite3',
    [
      join(dataDir, 'leanclaw.db'),
      `SELECT actor_type || '|' || COALESCE(actor_id, '') || '|' ||
              COALESCE(actor_name_snapshot, '')
       FROM run_events_archive
       WHERE task_id='${seeded.taskId}' AND type IN ('task-created','run-started')
       ORDER BY original_seq`
    ],
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
  expect(archivedActors).toEqual([
    'user||你',
    `agent|${seeded.agentId}|Activity Agent V1`
  ])
})
