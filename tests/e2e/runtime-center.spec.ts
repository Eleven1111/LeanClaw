import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, test } from '@playwright/test'
import type { RuntimeOverviewView } from '../../src/shared/types'
import { closeApp, launchApp, type LaunchedApp } from './helpers'

let launched: LaunchedApp | undefined
let providerServer: Server | undefined
let exportRoot = ''

function watchRendererErrors(window: LaunchedApp['window']): string[] {
  const errors: string[] = []
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  window.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.afterEach(async () => {
  if (providerServer) {
    await new Promise<void>((resolve) => providerServer?.close(() => resolve()))
    providerServer = undefined
  }
  if (launched) {
    await closeApp(launched)
    launched = undefined
  }
  if (exportRoot) {
    rmSync(exportRoot, { recursive: true, force: true })
    exportRoot = ''
  }
})

test('Runtime Center：未配置状态、侧边栏真值、Settings 深链与诊断入口', async () => {
  exportRoot = mkdtempSync(join(tmpdir(), 'leanclaw-runtime-center-'))
  const archivePath = join(exportRoot, 'runtime-center-diagnostics.zip')
  launched = await launchApp({ LEANCLAW_DIAGNOSTICS_EXPORT_PATH: archivePath })
  const { window } = launched
  const rendererErrors = watchRendererErrors(window)

  await window.setViewportSize({ width: 900, height: 600 })
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        api: { rpc(request: unknown): Promise<unknown> }
      }
    ).api
    const defaults = (await api.rpc({ method: 'getDefaults' })) as { samplePath: string }
    await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        api.rpc({
          method: 'createTask',
          goal: `Runtime 导航回顶验证 ${index + 1}`,
          inputPath: defaults.samplePath
        })
      )
    )
  })
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByRole('button', { name: 'Tasks' })).toContainText('30')
  await window.getByRole('button', { name: 'Runtime', exact: true }).click()
  await expect(window.getByRole('heading', { name: '本机运行环境' })).toBeVisible()
  await expect(window.getByText('部分异常', { exact: true }).first()).toBeVisible()
  await expect(window.getByText('尚未配置 Provider')).toBeVisible()
  await expect(window.getByText('安全默认')).toBeVisible()
  await expect(window.getByText('0', { exact: true }).first()).toBeVisible()
  await expect(window.getByText('$0.0000', { exact: true })).toBeVisible()

  const footerStatus = window.getByRole('button', { name: '运行时状态：部分异常' })
  await expect(footerStatus).toBeVisible()
  await footerStatus.click()
  await expect(window.getByRole('heading', { name: '本机运行环境' })).toBeVisible()
  const healthCard = window.locator('.runtime-health-hero')
  const beforeRefresh = await healthCard.boundingBox()
  await window.getByRole('button', { name: '刷新运行时状态' }).click()
  const afterRefresh = await healthCard.boundingBox()
  expect(afterRefresh?.width).toBe(beforeRefresh?.width)
  expect(afterRefresh?.height).toBe(beforeRefresh?.height)
  mkdirSync('.omx/state/runtime-center', { recursive: true })
  await window.screenshot({ path: '.omx/state/runtime-center/default.png' })

  const runtimeScrollTop = await window.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.content-area')
    if (!content) return 0
    content.scrollTop = content.scrollHeight
    return content.scrollTop
  })
  expect(runtimeScrollTop).toBeGreaterThan(0)
  await window.getByRole('button', { name: 'Tasks' }).click()
  await expect(window.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  const tasksScroll = await window.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.content-area')
    return content
      ? { top: content.scrollTop, max: content.scrollHeight - content.clientHeight }
      : { top: -1, max: -1 }
  })
  expect(tasksScroll.max).toBeGreaterThan(runtimeScrollTop)
  expect(tasksScroll.top).toBe(0)
  await footerStatus.click()
  await expect(window.getByRole('heading', { name: '本机运行环境' })).toBeVisible()

  await window.getByRole('button', { name: '前往 Provider 设置' }).click()
  await expect(window.getByRole('heading', { name: '模型服务商' })).toBeVisible()
  await expect(window.locator('#settings-providers')).toBeFocused()

  await window.getByRole('button', { name: 'Runtime', exact: true }).click()
  await window.getByRole('button', { name: '导出诊断包' }).click()
  await expect(window.getByRole('status')).toHaveText('已导出 runtime-center-diagnostics.zip')
  expect(existsSync(archivePath)).toBe(true)

  const overflow = await window.evaluate(() => ({
    body: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    page: document.querySelector('.runtime-center')?.scrollWidth ?? 0,
    client: document.querySelector('.runtime-center')?.clientWidth ?? 0
  }))
  expect(overflow.body).toBe(0)
  expect(overflow.page).toBeLessThanOrEqual(overflow.client)
  expect(rendererErrors).toEqual([])
})

test('Runtime Center：Provider 测试、MCP 三态、Shell 与活跃队列计数均可解释', async () => {
  providerServer = createServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [{ message: { content: 'OK' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        })
      )
    }, 150)
  })
  await new Promise<void>((resolve) => providerServer?.listen(0, '127.0.0.1', resolve))
  const port = (providerServer.address() as AddressInfo).port

  launched = await launchApp()
  const { window } = launched
  const rendererErrors = watchRendererErrors(window)
  await window.setViewportSize({ width: 900, height: 600 })
  const providerNames = {
    ok: `本机兼容服务商-${'可解释长名称'.repeat(3)}`,
    failed: '不可用服务商'
  }
  const mcpNames = {
    connected: `已连接 MCP-${'长名称'.repeat(5)}`,
    failed: '错误 MCP',
    disabled: '已停用 MCP'
  }
  const setup = await window.evaluate(
    async ({ okBaseUrl, providerNames, mcpNames, fixturePath, nodePath }) => {
      const api = (
        globalThis as unknown as {
          api: {
            upsertProvider(input: unknown): Promise<{
              providers: Array<{ id: string; name: string }>
            }>
            setProviderKey(providerId: string, key: string): Promise<unknown>
            upsertMcpServer(input: unknown): Promise<unknown>
            setShellEnabled(value: boolean): Promise<unknown>
            setShellAllowPrefixes(value: string[]): Promise<unknown>
            setMaxActiveTasks(value: number): Promise<unknown>
            rpc(request: unknown): Promise<unknown>
          }
        }
      ).api
      const okView = await api.upsertProvider({
        name: providerNames.ok,
        kind: 'openai-compat',
        baseUrl: okBaseUrl,
        defaultModel: 'fixture-model'
      })
      const okProvider = okView.providers.find((provider) => provider.name === providerNames.ok)
      if (!okProvider) throw new Error('未创建成功 Provider')
      await api.setProviderKey(okProvider.id, 'sk-local-success')

      const failedView = await api.upsertProvider({
        name: providerNames.failed,
        kind: 'openai-compat',
        baseUrl: 'http://127.0.0.1:1/v1',
        defaultModel: 'failed-model'
      })
      const failedProvider = failedView.providers.find(
        (provider) => provider.name === providerNames.failed
      )
      if (!failedProvider) throw new Error('未创建失败 Provider')
      await api.setProviderKey(failedProvider.id, 'sk-local-failed')

      await api.upsertMcpServer({
        name: mcpNames.connected,
        command: nodePath,
        args: [fixturePath],
        enabled: true,
        env: {}
      })
      await api.upsertMcpServer({
        name: mcpNames.failed,
        command: '__leanclaw_missing_mcp_binary__',
        args: [],
        enabled: true,
        env: {}
      })
      await api.upsertMcpServer({
        name: mcpNames.disabled,
        command: '__leanclaw_disabled_mcp__',
        args: [],
        enabled: false,
        env: {}
      })
      await api.setShellEnabled(true)
      await api.setShellAllowPrefixes(['npm test', 'git status'])
      await api.setMaxActiveTasks(1)

      const defaults = (await api.rpc({ method: 'getDefaults' })) as { samplePath: string }
      const tasks = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          api.rpc({
            method: 'createTask',
            goal: `Runtime Center 队列 ${index + 1}`,
            inputPath: defaults.samplePath
          })
        )
      )
      await Promise.all(
        (tasks as Array<{ id: string }>).map((task) =>
          api.rpc({ method: 'startTask', taskId: task.id })
        )
      )
      return {
        okProviderId: okProvider.id,
        failedProviderId: failedProvider.id
      }
    },
    {
      okBaseUrl: `http://127.0.0.1:${port}/v1`,
      providerNames,
      mcpNames,
      fixturePath: join(process.cwd(), 'tests/fixtures/mcp-echo-server.cjs'),
      nodePath: process.execPath
    }
  )

  await window.getByRole('button', { name: 'Runtime', exact: true }).click()
  await window.getByRole('button', { name: '刷新运行时状态' }).click()
  await expect(window.locator('.runtime-metric').filter({ hasText: '活跃任务' })).toContainText('1')
  await expect(
    window.locator('.runtime-metric').filter({ hasText: '排队任务' }).locator('strong')
  ).not.toHaveText('0')
  await expect
    .poll(
      async () =>
        window.evaluate(async () => {
          const api = (
            globalThis as unknown as {
              api: { rpc(request: unknown): Promise<unknown> }
            }
          ).api
          const overview = (await api.rpc({
            method: 'getRuntimeOverview'
          })) as RuntimeOverviewView
          return {
            active: overview.runtime.activeTasks,
            queued: overview.runtime.queuedTasks,
            mcp: overview.mcp.map((server) => [server.name, server.state])
          }
        }),
      { timeout: 10_000 }
    )
    .toMatchObject({
      mcp: expect.arrayContaining([
        [mcpNames.connected, 'connected'],
        [mcpNames.failed, 'error'],
        [mcpNames.disabled, 'disabled']
      ])
    })

  await window.getByRole('button', { name: '刷新运行时状态' }).click()
  const okProvider = window.getByRole('article', { name: providerNames.ok })
  const failedProvider = window.getByRole('article', { name: providerNames.failed })
  await expect(okProvider).toContainText('已配置')
  await expect(failedProvider).toContainText('已配置')
  const okTestButton = okProvider.getByRole('button', { name: '测试连接' })
  await okTestButton.click()
  await expect(okProvider.getByRole('button', { name: '测试中…' })).toBeDisabled()
  await expect(okProvider.getByRole('status')).toHaveText('连接成功')
  await failedProvider.getByRole('button', { name: '测试连接' }).click()
  await expect(failedProvider.getByRole('status')).toHaveText('连接失败，请前往设置检查配置。')
  await expect(failedProvider).not.toContainText('127.0.0.1')
  await expect(failedProvider).not.toContainText('ECONNREFUSED')

  await expect(window.getByRole('article', { name: mcpNames.connected })).toContainText('已连接')
  await expect(window.getByRole('article', { name: mcpNames.failed })).toContainText('连接错误')
  await expect(window.getByRole('article', { name: mcpNames.disabled })).toContainText('已停用')
  await expect(window.getByText('需逐次批准')).toBeVisible()
  await expect(window.getByText('2 条白名单')).toBeVisible()
  const overflow = await window.evaluate(() => ({
    body: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    page: document.querySelector('.runtime-center')?.scrollWidth ?? 0,
    client: document.querySelector('.runtime-center')?.clientWidth ?? 0
  }))
  expect(overflow.body).toBe(0)
  expect(overflow.page).toBeLessThanOrEqual(overflow.client)

  expect(setup.okProviderId).not.toBe(setup.failedProviderId)
  expect(rendererErrors).toEqual([])
})

test('Runtime Center：Runtime 超时离线后保留历史统计并可手动恢复', async () => {
  launched = await launchApp()
  const { app, window } = launched
  const rendererErrors = watchRendererErrors(window)
  const providerName = '离线操作禁用 Provider'
  await window.evaluate(async (name) => {
    const api = (
      globalThis as unknown as {
        api: {
          upsertProvider(input: unknown): Promise<{
            providers: Array<{ id: string; name: string }>
          }>
          setProviderKey(providerId: string, key: string): Promise<unknown>
        }
      }
    ).api
    const view = await api.upsertProvider({
      name,
      kind: 'openai-compat',
      baseUrl: 'http://127.0.0.1:1/v1',
      defaultModel: 'offline-model'
    })
    const provider = view.providers.find((item) => item.name === name)
    if (!provider) throw new Error('未创建离线测试 Provider')
    await api.setProviderKey(provider.id, 'sk-offline-test')
  }, providerName)

  await window.getByRole('button', { name: 'Runtime', exact: true }).click()
  await expect(window.getByRole('heading', { name: '本机运行环境' })).toBeVisible()
  await window.getByRole('button', { name: '刷新运行时状态' }).click()
  const providerCard = window.getByRole('article', { name: providerName })
  await expect(providerCard).toBeVisible()
  await expect(providerCard.getByRole('button', { name: '测试连接' })).toBeEnabled()
  const runtimePid = await app.evaluate(({ app: electronApp }) => {
    return electronApp
      .getAppMetrics()
      .find((metric) => metric.type === 'Utility' && metric.name === 'leanclaw-runtime')?.pid
  })
  expect(runtimePid).toBeTruthy()

  process.kill(runtimePid as number, 'SIGSTOP')
  try {
    await window.getByRole('button', { name: '刷新运行时状态' }).click()
    await expect(window.getByText('离线', { exact: true }).first()).toBeVisible({
      timeout: 5000
    })
    await expect(window.getByText('最近 7 日', { exact: true })).toBeVisible()
    await expect(providerCard.getByRole('button', { name: '测试连接' })).toBeDisabled()
  } finally {
    process.kill(runtimePid as number, 'SIGCONT')
  }

  await window.getByRole('button', { name: '刷新运行时状态' }).click()
  await expect(window.getByText('就绪', { exact: true }).first()).toBeVisible({
    timeout: 5000
  })
  await expect(providerCard.getByRole('button', { name: '测试连接' })).toBeEnabled()
  expect(rendererErrors).toEqual([])
})
