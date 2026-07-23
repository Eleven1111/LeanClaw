import { expect, test } from '@playwright/test'
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

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('Phase 2 旅程 A/B：Agent → Need You → Activity → Runtime，历史快照不被更新污染', async () => {
  launched = await launchApp()
  const { window } = launched
  const rendererErrors = watchRendererErrors(window)
  const originalInstructions = 'PHASE2_PRIVATE_AGENT_INSTRUCTIONS_V1'

  const baselineRuns = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    const overview = (await api.rpc({ method: 'getRuntimeOverview' })) as {
      usage7d: { runs: number }
    }
    return overview.usage7d.runs
  })

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await window.getByRole('button', { name: '创建 Agent' }).click()
  await window.getByLabel('Agent 名称').fill('Phase2 Agent V1')
  await window.getByLabel('用途说明').fill('负责阶段集成验收')
  await window.getByLabel('稳定指令').fill(originalInstructions)
  await window.getByLabel('默认 Recipe').selectOption('file-edit-summarize')
  await window.getByLabel('默认预算').fill('1.5')
  await window.getByLabel('最大并发').selectOption('1')
  await window.getByRole('button', { name: '保存 Agent' }).click()

  let agentCard = window.locator('.agent-card', { hasText: 'Phase2 Agent V1' })
  const agentId = await agentCard.getAttribute('data-agent-id')
  expect(agentId).toBeTruthy()
  await agentCard.getByRole('button', { name: '用它发起任务' }).click()
  await expect(window.getByLabel('Agent')).toHaveValue(agentId as string)
  await expect(window.getByLabel('Recipe')).toHaveValue('file-edit-summarize')
  await expect(window.getByLabel('预算 USD（可选）')).toHaveValue('1.5')

  const firstGoal = 'Phase 2 集成旅程 A 正常交付'
  await window.locator('.input-card textarea').fill(firstGoal)
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('.chip-agent')).toHaveText('Agent · Phase2 Agent V1')
  const firstTaskId = await window.evaluate(async (goal) => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    const tasks = (await api.rpc({ method: 'listTasks' })) as Array<{
      id: string
      goal: string
      recipeId: string
      budgetUsd: number | null
      agentName: string | null
    }>
    const task = tasks.find((item) => item.goal === goal)
    if (!task) throw new Error('未找到旅程 A Task')
    if (
      task.recipeId !== 'file-edit-summarize' ||
      task.budgetUsd !== 1.5 ||
      task.agentName !== 'Phase2 Agent V1'
    ) {
      throw new Error('Agent 默认值未原样固化')
    }
    return task.id
  }, firstGoal)

  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30_000 })
  const activity = window.locator('.task-activity-feed')
  await expect(activity).toContainText('Phase2 Agent V1请求你批准动作')

  await window.evaluate(async (id) => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    await api.rpc({
      method: 'saveAgent',
      id,
      name: 'Phase2 Agent V2',
      description: '已更新的执行配置',
      instructions: 'PHASE2_PRIVATE_AGENT_INSTRUCTIONS_V2',
      defaultRecipeId: 'content-pack',
      defaultBudgetUsd: 2.25,
      maxConcurrentRuns: 1
    })
  }, agentId)

  await window.getByRole('button', { name: 'Need You' }).click()
  const approvalItem = window.locator('.need-you-card', { hasText: firstGoal })
  await expect(approvalItem).toContainText('Agent · Phase2 Agent V1')
  await approvalItem.getByRole('button', { name: '批准', exact: true }).click()
  await expect
    .poll(
      () =>
        window.evaluate(async (taskId) => {
          const api = (globalThis as unknown as {
            api: { rpc(request: unknown): Promise<unknown> }
          }).api
          return ((await api.rpc({ method: 'getTask', taskId })) as { status: string }).status
        }, firstTaskId),
      { timeout: 30_000 }
    )
    .toBe('delivered')

  await window.getByRole('button', { name: 'Tasks' }).click()
  const firstRow = window.locator('.task-row', { hasText: firstGoal })
  await expect(firstRow).toContainText('Agent · Phase2 Agent V1')
  await firstRow.locator('.task-row-main').click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible()
  await expect(activity).toContainText('交付物已生成')
  await expect(activity).toContainText('Phase2 Agent V1')
  await expect(activity).not.toContainText('Phase2 Agent V2')

  const currentRuns = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    const overview = (await api.rpc({ method: 'getRuntimeOverview' })) as {
      usage7d: { runs: number }
    }
    return overview.usage7d.runs
  })
  expect(currentRuns).toBeGreaterThanOrEqual(baselineRuns + 1)
  await window.getByRole('button', { name: 'Runtime', exact: true }).click()
  await window.getByRole('button', { name: '刷新运行时状态' }).click()
  await expect(
    window.locator('.runtime-metric').filter({ hasText: '7 日 Run' }).locator('strong')
  ).toHaveText(new Intl.NumberFormat('zh-CN').format(currentRuns))

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  agentCard = window.locator('.agent-card', { hasText: 'Phase2 Agent V2' })
  await agentCard.getByRole('button', { name: '用它发起任务' }).click()
  await expect(window.getByLabel('Recipe')).toHaveValue('content-pack')
  await expect(window.getByLabel('预算 USD（可选）')).toHaveValue('2.25')
  const secondGoal = 'Phase 2 集成旅程 B 使用新配置'
  await window.locator('.input-card textarea').fill(secondGoal)
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('.chip-agent')).toHaveText('Agent · Phase2 Agent V2')
  const secondTaskId = await window.evaluate(async (goal) => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    const tasks = (await api.rpc({ method: 'listTasks' })) as Array<{
      id: string
      goal: string
      recipeId: string
      budgetUsd: number | null
      agentName: string | null
    }>
    const task = tasks.find((item) => item.goal === goal)
    if (!task) throw new Error('未找到旅程 B Task')
    if (
      task.recipeId !== 'content-pack' ||
      task.budgetUsd !== 2.25 ||
      task.agentName !== 'Phase2 Agent V2'
    ) {
      throw new Error('更新后的 Agent 配置未用于新 Task')
    }
    return task.id
  }, secondGoal)
  await window.evaluate(async (taskId) => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    await api.rpc({ method: 'stopTask', taskId })
  }, secondTaskId)

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  agentCard = window.locator('.agent-card', { hasText: 'Phase2 Agent V2' })
  await agentCard.getByRole('button', { name: '停用' }).click()
  await expect(agentCard).toContainText('已停用')
  await expect(agentCard.getByRole('button', { name: '用它发起任务' })).toBeDisabled()

  await window.getByRole('button', { name: 'Home' }).click()
  await expect(window.getByLabel('Agent').locator(`option[value="${agentId}"]`)).toHaveCount(0)
  await window.getByRole('button', { name: 'Tasks' }).click()
  await expect(window.locator('.task-row', { hasText: firstGoal })).toContainText(
    'Agent · Phase2 Agent V1'
  )
  expect(await window.locator('body').innerText()).not.toContain(originalInstructions)
  expect(rendererErrors).toEqual([])
})
