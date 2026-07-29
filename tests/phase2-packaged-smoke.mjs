import { _electron as electron, chromium, expect } from '@playwright/test'
import { mkdirSync } from 'fs'
import { isAbsolute, relative, resolve, sep } from 'path'

const executablePath = process.env.LEANCLAW_PACKAGED_APP
const dataDir = process.env.LEANCLAW_PACKAGED_DATA_DIR
const cdpUrl = process.env.LEANCLAW_PACKAGED_CDP_URL
if (!dataDir || (!cdpUrl && !executablePath)) {
  throw new Error('必须提供 packaged data dir，以及 CDP URL 或 packaged app')
}

const testRoot = process.env.LEANCLAW_TEST_ROOT ?? dataDir
const inside = relative(resolve(testRoot), resolve(dataDir))
if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
  throw new Error('packaged data dir 必须位于 LEANCLAW_TEST_ROOT 内')
}
const home = process.env.HOME && process.env.LEANCLAW_TEST_ROOT
  ? process.env.HOME
  : resolve(testRoot, 'home')
const temp = process.env.TMPDIR && process.env.LEANCLAW_TEST_ROOT
  ? process.env.TMPDIR
  : resolve(testRoot, 'tmp')
mkdirSync(home, { recursive: true })
mkdirSync(temp, { recursive: true })
process.env.LEANCLAW_TEST_ROOT = testRoot
process.env.LEANCLAW_DATA_DIR = dataDir
process.env.HOME = home
process.env.TMPDIR = temp

const browser = cdpUrl ? await chromium.connectOverCDP(cdpUrl) : null
const app = cdpUrl
  ? null
  : await electron.launch({
      executablePath,
      env: {
        ...process.env,
        LEANCLAW_TEST_ROOT: testRoot,
        LEANCLAW_DATA_DIR: dataDir,
        HOME: home,
        TMPDIR: temp,
        ANTHROPIC_API_KEY: '',
        LEANCLAW_WEB_MOCK: '1'
      }
    })

try {
  const window = app
    ? await app.firstWindow()
    : browser?.contexts().flatMap((context) => context.pages())[0]
  if (!window) throw new Error('未找到 packaged app Renderer 页面')
  await window.waitForLoadState('domcontentloaded')
  const rendererErrors = []
  window.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  window.on('pageerror', (error) => rendererErrors.push(error.message))

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await window.getByRole('button', { name: '创建 Agent' }).click()
  await window.getByLabel('Agent 名称').fill('Packaged Journey A Agent')
  await window.getByLabel('用途说明').fill('最终 ZIP 最短交付验证')
  await window.getByLabel('稳定指令').fill('只生成可验证的本机摘要。')
  await window.getByLabel('默认 Recipe').selectOption('file-edit-summarize')
  await window.getByLabel('默认预算').fill('1')
  await window.getByLabel('最大并发').selectOption('1')
  await window.getByRole('button', { name: '保存 Agent' }).click()
  const card = window.locator('.agent-card', { hasText: 'Packaged Journey A Agent' })
  await card.getByRole('button', { name: '用它发起任务' }).click()

  const goal = '最终 ZIP 旅程 A 最短交付'
  await window.locator('.input-card textarea').fill(goal)
  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.locator('.card.approval')).toBeVisible({ timeout: 30_000 })
  await expect(window.locator('.task-activity-feed')).toContainText('Packaged Journey A Agent')

  const taskId = await window.evaluate(async (taskGoal) => {
    const tasks = await globalThis.api.rpc({ method: 'listTasks' })
    const task = tasks.find((candidate) => candidate.goal === taskGoal)
    if (!task) throw new Error('最终 ZIP 中未找到旅程 A Task')
    return task.id
  }, goal)
  await window.getByRole('button', { name: 'Need You' }).click()
  await window
    .locator('.need-you-card', { hasText: goal })
    .getByRole('button', { name: '批准', exact: true })
    .click()
  await expect
    .poll(
      () =>
        window.evaluate(async (id) => {
          const task = await globalThis.api.rpc({ method: 'getTask', taskId: id })
          return task.status
        }, taskId),
      { timeout: 30_000 }
    )
    .toBe('delivered')

  const result = await window.evaluate(async (id) => {
    const task = await globalThis.api.rpc({ method: 'getTask', taskId: id })
    const activity = await globalThis.api.rpc({
      method: 'getTaskActivity',
      taskId: id,
      limit: 50
    })
    const runtime = await globalThis.api.rpc({ method: 'getRuntimeOverview' })
    return {
      status: task.status,
      agentName: task.agentName,
      recipeId: task.recipeId,
      budgetUsd: task.budgetUsd,
      activityTitles: activity.map((item) => item.title),
      runtimeRuns: runtime.usage7d.runs
    }
  }, taskId)

  expect(result).toMatchObject({
    status: 'delivered',
    agentName: 'Packaged Journey A Agent',
    recipeId: 'file-edit-summarize',
    budgetUsd: 1
  })
  expect(result.activityTitles).toContain('交付物已生成')
  expect(result.runtimeRuns).toBeGreaterThanOrEqual(1)
  expect(rendererErrors).toEqual([])
  process.stdout.write(`[packaged-journey-a] PASS ${JSON.stringify(result)}\n`)
} finally {
  if (app) await app.close()
  if (browser) await browser.close()
}
