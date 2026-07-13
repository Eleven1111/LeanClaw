import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined

test.afterEach(async () => {
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
})

test('归档压缩事件、配置快照配额，并窗口化 100+ 任务', async () => {
  launched = await launchApp()
  const { window, dataDir } = launched

  await window.getByRole('button', { name: '开始任务' }).click()
  await expect(window.getByText('待批准', { exact: false })).toBeVisible({ timeout: 30000 })
  await window.getByRole('button', { name: '批准' }).click()
  await expect(window.locator('.chip-green', { hasText: 'Delivered' })).toBeVisible({ timeout: 30000 })

  const delivered = await window.evaluate(async () => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    const tasks = await api.rpc({ method: 'listTasks' }) as { id: string; metrics: { eventCount: number } }[]
    return tasks[0]
  })
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.locator('.filter-chip', { hasText: 'Delivered' }).click()
  await window.locator('.task-row').getByRole('button', { name: '归档' }).click()

  const after = await window.evaluate(async (taskId) => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    const task = await api.rpc({ method: 'getTask', taskId }) as { metrics: { eventCount: number } }
    const run = await api.rpc({ method: 'getRunDetail', taskId }) as { events: { type: string }[] }
    return { eventCount: task.metrics.eventCount, eventTypes: run.events.map((event) => event.type) }
  }, delivered.id)
  expect(after.eventCount).toBeGreaterThan(delivered.metrics.eventCount)
  expect(after.eventTypes).toEqual(['events-archived'])

  await window.getByRole('button', { name: 'Settings' }).click()
  await expect(window.getByText(/已归档任务 1 个/)).toBeVisible()
  await expect(window.getByText(/已归档事件 [1-9]\d* 行/)).toBeVisible()
  mkdirSync('.omx/state/data-governance', { recursive: true })
  await window.getByRole('heading', { name: '来源快照配额（MB）' }).scrollIntoViewIfNeeded()
  await window.screenshot({ path: '.omx/state/data-governance/settings.png' })
  await window.getByLabel('来源快照配额').fill('9')
  await window.getByLabel('来源快照配额').locator('xpath=..').getByRole('button', { name: '保存' }).click()
  await expect(window.getByText(/快照配额必须是 10–10000 MB/)).toBeVisible()
  await window.getByLabel('来源快照配额').fill('10')
  await window.getByLabel('来源快照配额').locator('xpath=..').getByRole('button', { name: '保存' }).click()
  await expect(window.getByLabel('来源快照配额').locator('xpath=..').getByText('已保存')).toBeVisible()

  const snapshotRoot = join(dataDir, 'snapshots')
  const staleSnapshot = join(snapshotRoot, 'stale-unreferenced.html')
  mkdirSync(snapshotRoot, { recursive: true })
  writeFileSync(staleSnapshot, Buffer.alloc(11 * 1024 * 1024))
  const researchId = await window.evaluate(async () => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    const task = await api.rpc({ method: 'createTask', goal: '治理配额实弹', inputPath: '', recipeId: 'deep-research' }) as { id: string }
    await api.rpc({ method: 'startTask', taskId: task.id })
    return task.id
  })
  await expect.poll(() => window.evaluate(async (taskId) => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    const task = await api.rpc({ method: 'getTask', taskId }) as { status: string }
    return task.status
  }, researchId), { timeout: 30000 }).toBe('awaiting_approval')
  await window.evaluate(async (taskId) => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    const task = await api.rpc({ method: 'getTask', taskId }) as { approvals: { id: string; status: string }[] }
    const approval = task.approvals.find((item) => item.status === 'pending')
    await api.rpc({ method: 'resolveApproval', approvalId: approval?.id, decision: 'approved' })
  }, researchId)
  await expect.poll(() => window.evaluate(async (taskId) => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    return (await api.rpc({ method: 'getTask', taskId }) as { status: string }).status
  }, researchId), { timeout: 30000 }).toBe('delivered')
  expect(existsSync(staleSnapshot)).toBe(false)
  expect(readdirSync(snapshotRoot).filter((name) => name.endsWith('.html')).length).toBeGreaterThanOrEqual(2)

  await window.evaluate(async () => {
    const api = (globalThis as unknown as { api: { rpc: (request: unknown) => Promise<unknown> } }).api
    const defaults = await api.rpc({ method: 'getDefaults' }) as { samplePath: string }
    for (let index = 0; index < 101; index++) {
      await api.rpc({ method: 'createTask', goal: `批量任务 ${String(index).padStart(3, '0')}`, inputPath: defaults.samplePath })
    }
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await window.getByRole('button', { name: 'Tasks' }).click()
  const virtual = window.locator('.virtual-task-list')
  await expect(virtual).toHaveAttribute('data-total-count', '103')
  expect(await virtual.locator('.task-row').count()).toBeLessThan(30)
  await window.screenshot({ path: '.omx/state/data-governance/task-list.png' })
  await virtual.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => virtual.locator('.task-row').count()).toBeLessThan(30)
})
