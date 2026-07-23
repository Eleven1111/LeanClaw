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

test('Phase 2 UI 矩阵：九个核心页面、Retina 900×600、reduced-motion 与焦点/溢出', async () => {
  launched = await launchApp()
  const { app, window, dataDir } = launched
  const rendererErrors = watchRendererErrors(window)
  const screenshotDir = join(process.cwd(), '.omx', 'state', 'phase2-ui-matrix')
  mkdirSync(screenshotDir, { recursive: true })

  const seeded = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    const defaults = (await api.rpc({ method: 'getDefaults' })) as { samplePath: string }
    const agent = (await api.rpc({
      method: 'saveAgent',
      name: '矩阵 Agent 中英Long名称中英Long名称中英Long名称',
      description: '验证状态不依赖颜色与超长文案布局。',
      instructions: 'PHASE2_UI_PRIVATE_INSTRUCTIONS',
      defaultRecipeId: 'file-edit-summarize',
      defaultBudgetUsd: 1.5,
      maxConcurrentRuns: 1
    })) as { id: string }
    await api.rpc({
      method: 'saveSchedule',
      name: `矩阵自动化 ${'长名称 '.repeat(5)}`,
      goal: '验证自动化在窄窗口下仍可解释',
      inputPath: defaults.samplePath,
      recipeId: 'file-edit-summarize',
      agentId: agent.id,
      cadence: 'weekdays',
      timeOfDay: '08:30'
    })
    const task = (await api.rpc({
      method: 'createTask',
      goal: `矩阵任务 ${'超长中英文 mixed content '.repeat(5)}`,
      inputPath: defaults.samplePath,
      agentId: agent.id
    })) as { id: string }
    await api.rpc({ method: 'startTask', taskId: task.id })
    return { taskId: task.id, inputPath: defaults.samplePath }
  })

  await expect
    .poll(
      () =>
        window.evaluate(async (taskId) => {
          const api = (globalThis as unknown as {
            api: { rpc(request: unknown): Promise<unknown> }
          }).api
          return ((await api.rpc({ method: 'getTask', taskId })) as { status: string }).status
        }, seeded.taskId),
      { timeout: 30_000 }
    )
    .toBe('awaiting_approval')
  execFileSync('/usr/bin/sqlite3', [
    join(dataDir, 'leanclaw.db'),
    `INSERT INTO run_events
       (task_id, type, payload, actor_type, actor_name_snapshot, created_at)
     VALUES
       ('${seeded.taskId}', 'brief-edited',
        '{"brief":"PHASE2_PRIVATE_PROMPT_SENTINEL"}', 'user', '你',
        '2026-07-23T15:00:00.000Z'),
       ('${seeded.taskId}', 'refine-requested',
        '{"instruction":"PHASE2_PRIVATE_REFINE_SENTINEL"}', 'user', '你',
        '2026-07-23T15:00:01.000Z'),
       ('${seeded.taskId}', 'tool-forbidden',
        '{"toolId":"fs.write","input":{"path":"/Users/private/tool-input.md","content":"PHASE2_PRIVATE_TOOL_INPUT_SENTINEL"}}',
        'system', '系统', '2026-07-23T15:00:02.000Z');`
  ])
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  })
  await window.waitForTimeout(250)
  await window.getByRole('button', { name: 'Home' }).click()
  await window.screenshot({ path: join(screenshotDir, 'home-standard.png') })

  const cdp = await window.context().newCDPSession(window)
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 900,
    height: 600,
    deviceScaleFactor: 2,
    mobile: false
  })
  await window.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => window.evaluate(() => globalThis.devicePixelRatio)).toBe(2)

  const assertPageFrame = async (name: string): Promise<void> => {
    await window.waitForTimeout(120)
    const metrics = await window.evaluate(() => {
      const content = document.querySelector<HTMLElement>('.content-area')
      const active = document.activeElement as HTMLElement | null
      const style = active ? getComputedStyle(active) : null
      const rect = active?.getBoundingClientRect()
      return {
        horizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
        contentOverflowY: content ? getComputedStyle(content).overflowY : '',
        activeTag: active?.tagName ?? '',
        activeVisible: Boolean(
          rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < globalThis.innerHeight
        ),
        focusVisible: Boolean(
          style &&
          (style.outlineStyle !== 'none' ||
            style.outlineWidth !== '0px' ||
            style.boxShadow !== 'none')
        )
      }
    })
    expect(metrics.horizontalOverflow).toBe(false)
    expect(['auto', 'scroll']).toContain(metrics.contentOverflowY)
    await window.keyboard.press('Tab')
    const keyboardFocus = await window.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      if (!active) return { interactive: false, visible: false, indicator: false }
      const style = getComputedStyle(active)
      const rect = active.getBoundingClientRect()
      return {
        interactive: ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(active.tagName),
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < globalThis.innerHeight,
        indicator:
          style.outlineStyle !== 'none' ||
          style.outlineWidth !== '0px' ||
          style.boxShadow !== 'none'
      }
    })
    expect(keyboardFocus).toEqual({ interactive: true, visible: true, indicator: true })
    await window.screenshot({
      path: join(screenshotDir, `${name}-retina-900x600-reduced.png`)
    })
  }

  await window.getByRole('button', { name: 'Home' }).click()
  await expect(window.locator('.page-title')).toHaveText('新任务')
  await assertPageFrame('home')

  await window.getByRole('button', { name: 'Tasks' }).click()
  await expect(window.locator('.page-title')).toHaveText('任务')
  await assertPageFrame('tasks')

  const taskRow = window.locator('.task-row', { hasText: '矩阵任务' })
  await taskRow.locator('.task-row-main').click()
  await expect(window.locator('.page-title')).toHaveText('任务详情')
  await expect(window.locator('.task-activity-feed')).toContainText('矩阵 Agent')
  await assertPageFrame('task-workspace-activity')
  const privateDirectory = seeded.inputPath.slice(0, seeded.inputPath.lastIndexOf('/'))
  expect(await window.locator('body').innerText()).not.toContain(privateDirectory)

  const stepActivity = window.locator('button.activity-row[data-target="step"]').first()
  await expect(stepActivity).toBeVisible()
  await stepActivity.click()
  await expect(window.locator('.page-title')).toHaveText('运行检查')
  await assertPageFrame('run-inspector')
  const runDetailJson = await window.evaluate(async (taskId) => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    return JSON.stringify(await api.rpc({ method: 'getRunDetail', taskId }))
  }, seeded.taskId)
  expect(runDetailJson).not.toContain('PHASE2_PRIVATE')
  expect(runDetailJson).not.toContain('/Users/private')
  await window.getByRole('button', { name: /条 RunEvent \[展开\]/ }).click()
  const inspectorDom = await window.locator('body').innerText()
  expect(inspectorDom).not.toContain(privateDirectory)
  expect(inspectorDom).not.toContain('PHASE2_PRIVATE')
  expect(inspectorDom).not.toContain('/Users/private')

  await window.getByRole('button', { name: /^Agent(?: Agent)?$/ }).click()
  await expect(window.locator('.agent-card')).toContainText('已启用')
  await assertPageFrame('agent-center')
  expect(
    await window.locator('.agent-card').evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('none')

  await window.getByRole('button', { name: 'Need You' }).click()
  await expect(window.locator('.need-you-card')).toContainText('需批准')
  await expect(window.locator('.need-you-card')).toContainText('紧迫度')
  const needYouJson = await window.evaluate(async () => {
    const api = (globalThis as unknown as {
      api: { rpc(request: unknown): Promise<unknown> }
    }).api
    return JSON.stringify(await api.rpc({ method: 'listNeedYouItems' }))
  })
  expect(needYouJson).not.toContain(privateDirectory)
  expect(await window.locator('.need-you-card').innerText()).not.toContain(privateDirectory)
  await assertPageFrame('need-you')

  await window.getByRole('button', { name: 'Automations' }).click()
  await expect(window.locator('.automation-card')).toContainText('已启用')
  await assertPageFrame('automation')
  expect(
    await window
      .locator('.automation-card button')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration)
  ).toBe('0s')

  await window.getByRole('button', { name: 'Runtime', exact: true }).click()
  await expect(window.locator('.runtime-health-hero')).toContainText(/就绪|执行中|部分异常/)
  await assertPageFrame('runtime-center')

  await window.getByRole('button', { name: 'Settings' }).click()
  await expect(window.locator('.page-title')).toHaveText('设置')
  await assertPageFrame('settings')

  const safeDom = await window.locator('body').innerText()
  expect(safeDom).not.toContain('PHASE2_UI_PRIVATE_INSTRUCTIONS')
  expect(seeded.taskId).toBeTruthy()
  expect(rendererErrors).toEqual([])
})
