import { expect, test } from '@playwright/test'
import type { NeedYouItemView, RuntimeOverviewView, TaskView } from '../../src/shared/types'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

async function startHomeTask(
  window: LaunchedApp['window'],
  goal: string,
  recipeId = 'file-edit-summarize',
  budgetUsd?: string
): Promise<string> {
  await window.locator('.input-card textarea').fill(goal)
  await window.getByLabel('Recipe').selectOption(recipeId)
  if (budgetUsd !== undefined) {
    await window.getByLabel('预算 USD（可选）').fill(budgetUsd)
  }
  await window.getByRole('button', { name: '开始任务' }).click()
  return window.evaluate(async (taskGoal) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    const tasks = (await api.rpc({ method: 'listTasks' })) as TaskView[]
    const task = tasks.find((candidate) => candidate.goal === taskGoal)
    if (!task) throw new Error(`未找到故障旅程 Task：${taskGoal}`)
    return task.id
  }, goal)
}

async function needYouFor(
  window: LaunchedApp['window'],
  taskId: string
): Promise<NeedYouItemView[]> {
  return window.evaluate(async (id) => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    return ((await api.rpc({ method: 'listNeedYouItems' })) as NeedYouItemView[]).filter(
      (item) => item.taskId === id
    )
  }, taskId)
}

async function runtimeOverview(
  window: LaunchedApp['window']
): Promise<RuntimeOverviewView> {
  return window.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { rpc(request: unknown): Promise<unknown> } }
    ).api
    return api.rpc({ method: 'getRuntimeOverview' }) as Promise<RuntimeOverviewView>
  })
}

test('旅程 C：Tool 连败进入 Andon，三处状态一致并可明确取消', async () => {
  launched = await launchApp({ LEANCLAW_FAULT: 'tool_fail' })
  const { window } = launched
  const taskId = await startHomeTask(window, 'Phase 2 Tool 连败旅程')

  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30_000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('#andon-card')).toContainText('模拟工具故障', {
    timeout: 30_000
  })
  await expect(window.locator('.task-activity-feed')).toContainText('任务需要处理')

  const inbox = await needYouFor(window, taskId)
  expect(inbox).toHaveLength(1)
  expect(inbox[0]).toMatchObject({ type: 'andon', primaryAction: 'retry' })
  const overview = await runtimeOverview(window)
  expect(overview.overall).not.toBe('offline')
  expect(overview.usage7d.toolCalls).toBeGreaterThanOrEqual(2)

  await window.getByRole('button', { name: 'Need You' }).click()
  const card = window.locator('.need-you-card', { hasText: 'Phase 2 Tool 连败旅程' })
  await expect(card).toContainText('任务已停线')
  await card.getByRole('button', { name: '取消任务' }).click()
  await expect(card).toHaveCount(0)
  await expect.poll(() => needYouFor(window, taskId)).toEqual([])
})

test('旅程 C：bad citation 被验证门拦下，三处状态一致并可明确取消', async () => {
  launched = await launchApp({ LEANCLAW_FAULT: 'bad_citation' })
  const { window } = launched
  const taskId = await startHomeTask(window, 'Phase 2 bad citation 旅程')

  await expect(window.getByText('任务被验证门拦下')).toBeVisible({ timeout: 30_000 })
  await expect(window.locator('.task-activity-feed')).toContainText('验证门拦截了交付')
  const inbox = await needYouFor(window, taskId)
  expect(inbox).toHaveLength(1)
  expect(inbox[0]).toMatchObject({
    type: 'verification_failed',
    primaryAction: 'retry_checkpoint'
  })
  const overview = await runtimeOverview(window)
  expect(overview.overall).not.toBe('offline')
  expect(overview.usage7d.modelCalls).toBeGreaterThanOrEqual(1)

  await window.getByRole('button', { name: 'Need You' }).click()
  const card = window.locator('.need-you-card', { hasText: 'Phase 2 bad citation 旅程' })
  await expect(card).toContainText('验证门拦截')
  await card.getByRole('button', { name: '取消任务' }).click()
  await expect(card).toHaveCount(0)
})

test('旅程 C：昂贵模型触发预算停线，三处状态一致并可明确取消', async () => {
  launched = await launchApp({ LEANCLAW_FAULT: 'expensive_model' })
  const { window } = launched
  const taskId = await startHomeTask(window, 'Phase 2 预算停线旅程', 'content-pack', '0.05')

  await expect(window.locator('#andon-card')).toContainText('预算已用尽', {
    timeout: 30_000
  })
  await expect(window.locator('.task-activity-feed')).toContainText('预算不足，任务已停线')
  const inbox = await needYouFor(window, taskId)
  expect(inbox).toHaveLength(1)
  expect(inbox[0]).toMatchObject({ type: 'budget', primaryAction: 'add_budget' })
  const overview = await runtimeOverview(window)
  expect(overview.overall).not.toBe('offline')
  expect(overview.usage7d.costUsd).toBeGreaterThanOrEqual(0.06)

  await window.getByRole('button', { name: 'Need You' }).click()
  const card = window.locator('.need-you-card', { hasText: 'Phase 2 预算停线旅程' })
  await expect(card).toContainText('预算不足')
  await card.getByRole('button', { name: '取消任务' }).click()
  await expect(card).toHaveCount(0)
})

test('旅程 C：Provider 主路 500 后 fallback 自动交付且不制造 Need You', async () => {
  launched = await launchApp({ LEANCLAW_FAULT: 'primary_500' })
  const { window } = launched
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        api: {
          upsertProvider(input: unknown): Promise<unknown>
          setProviderKey(providerId: string, key: string): Promise<unknown>
          setTierRoute(input: unknown): Promise<unknown>
        }
      }
    ).api
    await api.upsertProvider({
      id: 'phase2-primary',
      name: 'Phase2 Primary',
      kind: 'anthropic',
      baseUrl: 'https://api.invalid',
      defaultModel: 'phase2-primary-model'
    })
    await api.setProviderKey('phase2-primary', 'phase2-test-key')
    await api.setTierRoute({
      tier: 'generation',
      providerId: 'phase2-primary',
      model: 'phase2-primary-model',
      fallback: { providerId: 'mock', model: 'mock-local' }
    })
  })

  const taskId = await startHomeTask(window, 'Phase 2 Provider fallback 旅程')
  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30_000 })
  await expect(window.locator('.task-activity-feed')).toContainText('模型已切换到备选模型')
  expect(await needYouFor(window, taskId)).toHaveLength(1)
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({
    timeout: 30_000
  })
  await expect.poll(() => needYouFor(window, taskId)).toEqual([])

  const overview = await runtimeOverview(window)
  expect(overview.overall).not.toBe('offline')
  expect(overview.usage7d.modelCalls).toBeGreaterThanOrEqual(2)
  expect(overview.providers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Phase2 Primary', configured: true })
    ])
  )
  await window.getByRole('button', { name: 'Runtime', exact: true }).click()
  await expect(window.locator('.runtime-resource-card', { hasText: 'Phase2 Primary' })).toBeVisible()
})
