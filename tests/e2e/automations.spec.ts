import { execFileSync } from 'child_process'
import { mkdirSync } from 'fs'
import { join } from 'path'
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

test('Automation：空状态、Home 快捷创建、编辑与重启持久化', async () => {
  launched = await launchApp({ TZ: 'UTC' })
  let { window } = launched
  const rendererErrors = watchRendererErrors(window)
  await window.setViewportSize({ width: 900, height: 600 })

  await window.getByRole('button', { name: 'Automations' }).click()
  await expect(window.getByRole('main').getByRole('heading', { name: '自动化' })).toBeVisible()
  await expect(window.getByText('还没有自动化')).toBeVisible()

  await window.getByRole('button', { name: 'Home' }).click()
  await window.getByRole('button', { name: '保存为自动化' }).click()
  await window.getByPlaceholder('自动化名称').fill('每日摘要')
  await window.getByLabel('重复频率').selectOption('weekdays')
  await window.getByLabel('执行时间').fill('08:30')
  await window.getByRole('button', { name: '保存自动化' }).click()
  await window.getByRole('button', { name: '查看自动化' }).click()

  let card = window.locator('.automation-card', { hasText: '每日摘要' })
  await expect(card).toContainText('工作日 08:30')
  await expect(card).toContainText('UTC')
  await card.getByRole('button', { name: '编辑' }).click()
  await window.getByLabel('自动化名称').fill('工作日摘要')
  await window.getByRole('button', { name: '保存修改' }).click()
  card = window.locator('.automation-card', { hasText: '工作日摘要' })
  await expect(card).toBeVisible()

  const dataDir = launched.dataDir
  await launched.app.close()
  launched = undefined
  launched = await launchApp({ TZ: 'UTC' }, dataDir)
  window = launched.window
  const restartedRendererErrors = watchRendererErrors(window)
  await window.setViewportSize({ width: 900, height: 600 })
  await window.getByRole('button', { name: 'Automations' }).click()
  await expect(window.locator('.automation-card', { hasText: '工作日摘要' })).toBeVisible()
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true)
  const screenshotDir = join(process.cwd(), '.omx', 'state', 'automations')
  mkdirSync(screenshotDir, { recursive: true })
  await window.screenshot({
    path: join(screenshotDir, 'default.png'),
    fullPage: true
  })
  expect(rendererErrors).toEqual([])
  expect(restartedRendererErrors).toEqual([])
})

test('Automation：立即运行、五次历史、Agent 互锁与删除保留 Task', async () => {
  launched = await launchApp()
  const { window, dataDir } = launched
  const rendererErrors = watchRendererErrors(window)
  const setup = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    const defaults = (await api.rpc({ method: 'getDefaults' })) as { samplePath: string }
    const agent = (await api.rpc({
      method: 'saveAgent',
      name: 'Automation Agent',
      description: '自动化测试',
      instructions: '保持引用完整。',
      maxConcurrentRuns: 1,
      enabled: true
    })) as { id: string }
    const schedule = (await api.rpc({
      method: 'saveSchedule',
      name: '手动验证自动化',
      goal: '生成自动化摘要',
      inputPath: defaults.samplePath,
      recipeId: 'file-edit-summarize',
      agentId: agent.id,
      cadence: 'daily',
      timeOfDay: '23:59'
    })) as { id: string; nextRunAt: string }
    return { agentId: agent.id, scheduleId: schedule.id, nextRunAt: schedule.nextRunAt }
  })

  await window.getByRole('button', { name: 'Automations' }).click()
  const card = window.locator('.automation-card', { hasText: '手动验证自动化' })
  for (let index = 0; index < 6; index++) {
    await card.getByRole('button', { name: '立即运行' }).click()
    await expect(card.getByRole('status')).toContainText('已创建任务')
  }
  execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `UPDATE tasks SET created_at = '2030-01-01T00:00:00.000Z' WHERE schedule_id = '${setup.scheduleId}';`
  ])
  const expectedHistoryIds = execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `SELECT id FROM tasks WHERE schedule_id = '${setup.scheduleId}' ORDER BY rowid DESC LIMIT 5;`
  ], { encoding: 'utf8' }).trim().split('\n')
  const afterTrigger = await window.evaluate(async (scheduleId) => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    const schedules = (await api.rpc({ method: 'listSchedules' })) as Array<{
      id: string
      nextRunAt: string
    }>
    const history = (await api.rpc({
      method: 'getScheduleHistory',
      scheduleId,
      limit: 5
    })) as Array<{ taskId: string; triggerSource: string }>
    return {
      nextRunAt: schedules.find((item) => item.id === scheduleId)?.nextRunAt,
      history
    }
  }, setup.scheduleId)
  expect(afterTrigger.nextRunAt).toBe(setup.nextRunAt)
  expect(afterTrigger.history).toHaveLength(5)
  expect(afterTrigger.history.map((item) => item.taskId)).toEqual(expectedHistoryIds)
  expect(afterTrigger.history.every((item) => item.triggerSource === 'manual')).toBe(true)

  const firstTaskId = afterTrigger.history[0].taskId
  execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `INSERT INTO artifacts
      (id, task_id, run_id, step_id, type, title, version, is_deliverable, created_at)
     VALUES
      ('automation-deliverable', '${firstTaskId}', 'history-run', 'history-step',
       'final', '自动化成品', 3, 1, '2030-01-01T00:00:01.000Z');`
  ])
  await card.getByRole('button', { name: '最近运行' }).click()
  const historyRows = card.locator('.automation-history-row')
  await expect(historyRows).toHaveCount(5)
  await expect(historyRows.first()).toContainText('手动')
  await expect(historyRows.first()).toContainText('自动化成品')
  await expect(historyRows.first()).toContainText('v3')
  await historyRows.first().click()
  await expect(window.getByRole('heading', { name: '生成自动化摘要' })).toBeVisible()
  await window.getByRole('button', { name: 'Automations' }).click()

  await card.getByRole('button', { name: '暂停' }).click()
  await window.evaluate(async (agentId) => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    await api.rpc({ method: 'setAgentEnabled', agentId, enabled: false })
  }, setup.agentId)
  await card.getByRole('button', { name: '启用' }).click()
  await expect(card).toContainText('Agent 已停用')

  await card.getByRole('button', { name: '删除' }).click()
  await expect(card).toHaveCount(0)
  const taskRow = execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `SELECT schedule_id || '|' || schedule_trigger_source FROM tasks WHERE id = '${firstTaskId}';`
  ], { encoding: 'utf8' }).trim()
  expect(taskRow).toBe(`${setup.scheduleId}|manual`)
  expect(rendererErrors).toEqual([])
})

test('Automation：执行失败进入 Need You，历史说明需要处理', async () => {
  launched = await launchApp()
  const { window } = launched
  const rendererErrors = watchRendererErrors(window)
  await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    await api.rpc({
      method: 'saveSchedule',
      name: '失败自动化',
      goal: '读取不存在的文件',
      inputPath: '/nonexistent/automation-input.md',
      recipeId: 'file-edit-summarize',
      cadence: 'daily',
      timeOfDay: '23:59'
    })
  })
  await window.getByRole('button', { name: 'Automations' }).click()
  const card = window.locator('.automation-card', { hasText: '失败自动化' })
  await card.getByRole('button', { name: '立即运行' }).click()
  await expect(window.getByRole('button', { name: 'Need You' })).toContainText('1', {
    timeout: 30_000
  })
  await expect(card).toContainText('需要你处理')
  await card.getByRole('button', { name: '最近运行' }).click()
  await expect(card.locator('.automation-history-row').first()).toContainText('已进入 Need You')
  expect(rendererErrors).toEqual([])
})
