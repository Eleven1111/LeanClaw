import { execFileSync } from 'child_process'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import type { NeedYouItemView } from '../../src/shared/types'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

function watchRendererErrors(window: LaunchedApp['window']): string[] {
  const errors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  window.on('pageerror', (error) => errors.push(error.message))
  return errors
}

function seedNeedYouFixtures(dataDir: string): void {
  const dbPath = join(dataDir, 'leanclaw.db')
  const tasks = [
    ['task-verify', '验证失败任务', 'verification_failed', '验证 Agent', '2026-07-23T08:00:00.000Z'],
    ['task-blocked', '普通阻塞任务', 'failed', '恢复 Agent', '2026-07-23T09:00:00.000Z'],
    ['task-approve', '批准写入任务', 'awaiting_approval', '写作 Agent', '2026-07-23T10:00:00.000Z'],
    ['task-reject', '拒绝危险任务', 'awaiting_approval', '安全 Agent', '2026-07-23T10:30:00.000Z'],
    ['task-andon-retry', '可重试停线任务', 'andon_open', null, '2026-07-23T11:00:00.000Z'],
    ['task-andon-cancel', '应取消停线任务', 'andon_open', '审核 Agent', '2026-07-23T11:30:00.000Z'],
    ['task-budget', '预算补充任务', 'andon_open', '研究 Agent', '2026-07-23T12:00:00.000Z']
  ] as const

  const sql = [
    'BEGIN;',
    `INSERT INTO agents
      (id, name, description, instructions, max_concurrent_runs, enabled, created_at, updated_at)
     VALUES
      ('agent-paused', '待办测试 Agent', '', '', 0, 1,
       '2026-07-23T07:00:00.000Z', '2026-07-23T07:00:00.000Z');`,
    ...tasks.map(
      ([id, goal, status, agent, createdAt]) =>
        `INSERT INTO tasks
          (id, agent_id, agent_name_snapshot, goal, input_path, recipe_id, status, created_at, updated_at)
         VALUES
          ('${id}', 'agent-paused', ${agent ? `'${agent}'` : 'NULL'}, '${goal}', '',
           'file-edit-summarize',
           '${status}', '${createdAt}', '${createdAt}');`
    ),
    ...tasks
      .filter(([id]) => id !== 'task-blocked')
      .map(
        ([id, , status, , createdAt]) =>
          `INSERT INTO runs
            (id, task_id, recipe_id, status, current_step_index, resume_step_index, started_at)
           VALUES
            ('run-${id}', '${id}', 'file-edit-summarize',
             '${status === 'verification_failed' ? 'verification_failed' : 'running'}', 0, 0, '${createdAt}');
           INSERT INTO steps
            (id, run_id, idx, name, title, kind, status, attempt)
           VALUES
            ('step-${id}', 'run-${id}', 0, 'read_input', '读取输入文件', 'tool',
             '${status === 'verification_failed' ? 'failed' : 'pending'}', 1);`
      ),
    `INSERT INTO approvals
      (id, task_id, run_id, step_id, action_desc, diff, status, requested_at)
     VALUES
      ('approval-approve', 'task-approve', 'run-task-approve', 'step-task-approve',
       '允许写入本地摘要文件', '新增 output.md', 'pending', '2026-07-23T10:00:00.000Z'),
      ('approval-reject', 'task-reject', 'run-task-reject', 'step-task-reject',
       '允许覆盖安全策略文件', '修改 policy.md', 'pending', '2026-07-23T10:30:00.000Z');`,
    `INSERT INTO andon_events
      (id, task_id, run_id, step_id, reason, impact, recommended_actions,
       resume_step_index, status, created_at)
     VALUES
      ('andon-retry', 'task-andon-retry', 'run-task-andon-retry', 'step-task-andon-retry',
       '输入文件暂时不可读', '任务无法继续', '["retry","cancel"]', 0, 'open',
       '2026-07-23T11:00:00.000Z'),
      ('andon-cancel', 'task-andon-cancel', 'run-task-andon-cancel', 'step-task-andon-cancel',
       '上游预算字段格式损坏', '继续执行没有意义', '["retry","cancel"]', 0, 'open',
       '2026-07-23T11:30:00.000Z'),
      ('andon-budget', 'task-budget', 'run-task-budget', 'step-task-budget',
       '预算已用尽（$2.5000/$2.00）',
       '此前步骤的产物仍然有效；可追加预算后重试当前步骤。',
       '["retry","cancel"]', 0, 'open',
       '2026-07-23T12:00:00.000Z');`,
    `INSERT INTO verifications
      (id, run_id, step_id, kind, status, detail, created_at)
     VALUES
      ('verification-failed', 'run-task-verify', 'step-task-verify', 'citation', 'failed',
       '引用无法追溯到来源，需要从检查点重试。', '2026-07-23T08:00:00.000Z');`,
    `INSERT INTO run_events
      (task_id, type, payload, created_at)
     VALUES
      ('task-blocked', 'andon-opened', '{malformed-json',
       '2026-07-23T09:00:00.000Z');`,
    'COMMIT;'
  ].join('\n')

  execFileSync('/usr/bin/sqlite3', [dbPath, sql])
}

async function loadFixtures(): Promise<{
  window: LaunchedApp['window']
  rendererErrors: string[]
}> {
  launched = await launchApp()
  const rendererErrors = watchRendererErrors(launched.window)
  seedNeedYouFixtures(launched.dataDir)
  await launched.window.reload()
  await launched.window.waitForLoadState('domcontentloaded')
  return { window: launched.window, rendererErrors }
}

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('Need You：五类真值、排序、实时计数、Home 复用与 900×600 布局', async () => {
  const { window, rendererErrors } = await loadFixtures()
  await window.setViewportSize({ width: 900, height: 600 })

  const projected = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    return api.rpc({ method: 'listNeedYouItems' }) as Promise<NeedYouItemView[]>
  })
  expect(projected.map((item) => item.type)).toEqual([
    'verification_failed',
    'blocked',
    'approval',
    'approval',
    'andon',
    'andon',
    'budget'
  ])

  const inboxNav = window.getByRole('button', { name: 'Need You' })
  await expect(inboxNav).toContainText('7')
  await inboxNav.click()
  await expect(window.getByRole('main').getByRole('heading', { name: '需要你处理' })).toBeVisible()
  const cards = window.locator('.need-you-card')
  await expect(cards).toHaveCount(7)
  await expect(cards.nth(0)).toContainText('验证失败任务')
  await expect(cards.nth(1)).toContainText('普通阻塞任务')
  await expect(cards.nth(2)).toContainText('批准写入任务')
  await expect(window.getByText('验证门拦截', { exact: true })).toBeVisible()
  await expect(window.getByText('任务已阻塞', { exact: true })).toBeVisible()
  await expect(window.getByText('待批准的受控操作', { exact: true }).first()).toBeVisible()
  await expect(window.getByText('任务已停线', { exact: true }).first()).toBeVisible()
  await expect(window.getByText('预算不足', { exact: true })).toBeVisible()

  const blockedCard = cards.filter({ hasText: '普通阻塞任务' })
  await expect(blockedCard.getByRole('button')).toHaveCount(1)
  await expect(blockedCard.getByRole('button', { name: '查看任务' })).toBeVisible()
  await blockedCard.getByRole('button', { name: '查看任务' }).click()
  await expect(window.getByRole('heading', { name: '普通阻塞任务' })).toBeVisible()

  await inboxNav.click()
  const inboxTopThree = await cards.evaluateAll((nodes) =>
    nodes.slice(0, 3).map((node) => node.getAttribute('data-need-you-id'))
  )
  await window.getByRole('button', { name: 'Home' }).click()
  const homeCards = window.locator('.home .need-you-card')
  await expect(homeCards).toHaveCount(3)
  const homeTopThree = await homeCards.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-need-you-id'))
  )
  expect(homeTopThree).toEqual(inboxTopThree)
  await expect(window.getByRole('button', { name: '查看全部待处理' })).toBeVisible()

  await inboxNav.click()
  mkdirSync('.omx/state/need-you', { recursive: true })
  await window.screenshot({ path: '.omx/state/need-you/default.png' })
  const overflow = await window.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    page: document.querySelector('.need-you-page')?.scrollWidth ?? 0,
    client: document.querySelector('.need-you-page')?.clientWidth ?? 0
  }))
  expect(overflow.document).toBe(0)
  expect(overflow.page).toBeLessThanOrEqual(overflow.client)
  expect(rendererErrors).toEqual([])
})

test('Need You：现有安全动作、失败保留、过期拒绝与任务隔离', async () => {
  const { window, rendererErrors } = await loadFixtures()
  await window.getByRole('button', { name: 'Need You' }).click()

  const cards = window.locator('.need-you-card')
  const approveCard = cards.filter({ hasText: '批准写入任务' })
  const rejectCard = cards.filter({ hasText: '拒绝危险任务' })
  await approveCard.getByRole('button', { name: '批准', exact: true }).click()
  await expect(approveCard).toHaveCount(0)
  await expect(rejectCard).toHaveCount(1)

  const staleError = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    try {
      await api.rpc({
        method: 'resolveApproval',
        approvalId: 'approval-approve',
        decision: 'approved'
      })
      return ''
    } catch (error) {
      return (error as Error).message
    }
  })
  expect(staleError).toContain('已处理过')

  execFileSync('/usr/bin/sqlite3', [
    join(launched!.dataDir, 'leanclaw.db'),
    "UPDATE approvals SET status = 'approved' WHERE id = 'approval-reject';"
  ])
  await rejectCard.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(rejectCard).toContainText('Approval 已处理过')
  await expect(rejectCard).toHaveCount(1)
  execFileSync('/usr/bin/sqlite3', [
    join(launched!.dataDir, 'leanclaw.db'),
    "UPDATE approvals SET status = 'pending' WHERE id = 'approval-reject';"
  ])
  await rejectCard.getByRole('button', { name: '拒绝' }).click()
  await expect(rejectCard).toHaveCount(0)

  const retryAndon = cards.filter({ hasText: '可重试停线任务' })
  execFileSync('/usr/bin/sqlite3', [
    join(launched!.dataDir, 'leanclaw.db'),
    `UPDATE andon_events SET recommended_actions = '["cancel"]' WHERE id = 'andon-retry';`
  ])
  const disallowedRetry = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    try {
      await api.rpc({ method: 'resolveAndon', andonId: 'andon-retry', action: 'retry' })
      return ''
    } catch (error) {
      return (error as Error).message
    }
  })
  expect(disallowedRetry).toContain('不允许动作')
  execFileSync('/usr/bin/sqlite3', [
    join(launched!.dataDir, 'leanclaw.db'),
    `UPDATE andon_events SET recommended_actions = '["retry","cancel"]' WHERE id = 'andon-retry';`
  ])
  await retryAndon.getByRole('button', { name: '重试' }).click()
  await expect(retryAndon).toHaveCount(0)

  const cancelAndon = cards.filter({ hasText: '应取消停线任务' })
  await cancelAndon.getByRole('button', { name: '取消任务' }).click()
  await expect(cancelAndon).toHaveCount(0)

  const verification = cards.filter({ hasText: '验证失败任务' })
  await verification.getByRole('button', { name: '从检查点重试' }).click()
  await expect(verification).toHaveCount(0)

  const budget = cards.filter({ hasText: '预算补充任务' })
  const budgetInput = budget.getByRole('spinbutton', { name: '新的总预算 USD' })
  await budgetInput.fill('0')
  await budget.getByRole('button', { name: '更新预算并重试' }).click()
  await expect(budget).toContainText('请输入大于 0 的总预算')
  await expect(budget).toHaveCount(1)
  await budgetInput.fill('12.5')
  execFileSync('/usr/bin/sqlite3', [
    join(launched!.dataDir, 'leanclaw.db'),
    `UPDATE andon_events SET recommended_actions = '["cancel"]' WHERE id = 'andon-budget';`
  ])
  await budget.getByRole('button', { name: '更新预算并重试' }).click()
  await expect(budget).toContainText('预算已更新，但任务恢复失败')
  await expect(budget).toHaveCount(1)
  execFileSync('/usr/bin/sqlite3', [
    join(launched!.dataDir, 'leanclaw.db'),
    `UPDATE andon_events SET recommended_actions = '["retry","cancel"]' WHERE id = 'andon-budget';`
  ])
  await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    await api.rpc({ method: 'updateBudget', taskId: 'task-budget', budgetUsd: 12.5 })
  })
  await expect(budget.getByRole('button', { name: '仅重试恢复' })).toBeVisible()
  await budget.getByRole('button', { name: '仅重试恢复' }).click()
  await expect(budget).toHaveCount(0)

  await expect(window.getByRole('button', { name: 'Need You' })).toContainText('1')
  await expect(cards.filter({ hasText: '普通阻塞任务' })).toHaveCount(1)
  expect(rendererErrors).toEqual([])
})

test('Need You：Task push 会把真实停线及时加入侧边栏与收件箱', async () => {
  launched = await launchApp()
  const { window } = launched
  const rendererErrors = watchRendererErrors(window)
  const inboxNav = window.getByRole('button', { name: 'Need You' })
  await expect(inboxNav).toContainText('0')
  const input = window.getByPlaceholder('输入文件路径（可直接拖入文件）')
  await expect(input).not.toHaveValue('', { timeout: 10_000 })
  await input.fill('/nonexistent/need-you-push.md')
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(inboxNav).toContainText('1', { timeout: 30_000 })
  await inboxNav.click()
  await expect(window.locator('.need-you-card')).toHaveCount(1)
  await expect(window.locator('.need-you-card')).toContainText('任务已停线')
  expect(rendererErrors).toEqual([])
})
