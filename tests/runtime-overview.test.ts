import { describe, expect, it } from 'vitest'
import {
  createOfflineRuntimeOverview,
  deriveRuntimeHealth,
  type RuntimeHealthInput
} from '../src/shared/runtime-health'
import {
  buildRuntimeOverview,
  queryUsage7d,
  resolveProviderForConnectionTest
} from '../src/runtime/runtime-overview'
import type { RuntimeConfig } from '../src/runtime/config'
import type { McpServerStatus } from '../src/shared/types'

function health(overrides: Partial<RuntimeHealthInput> = {}): RuntimeHealthInput {
  return {
    runtimeReachable: true,
    activeTasks: 0,
    providers: [{ configured: true }],
    mcp: [],
    criticalConfigError: false,
    ...overrides
  }
}

function usageDb(
  row: Record<string, number | null>,
  inspect?: (sql: string, params: unknown[]) => void
): {
  prepare(sql: string): { get(...params: unknown[]): unknown }
} {
  return {
    prepare(sql: string) {
      return {
        get(...params: unknown[]) {
          inspect?.(sql, params)
          return row
        }
      }
    }
  }
}

const CONFIG: RuntimeConfig = {
  apiKey: null,
  model: 'mock-local',
  maxActiveTasks: 3,
  defaultBudgetUsd: 0,
  snapshotQuotaMb: 250,
  providers: [
    {
      id: 'p1',
      name: 'Configured Provider',
      kind: 'openai-compat',
      baseUrl: 'https://example.invalid',
      defaultModel: 'safe-model',
      inputPricePerM: null,
      outputPricePerM: null,
      apiKey: 'sk-runtime-secret'
    }
  ],
  defaultProviderId: 'p1',
  tierMap: {},
  mcpServers: [],
  mcpToolRisk: {},
  shellEnabled: false,
  shellAllowPrefixes: []
}

describe('deriveRuntimeHealth', () => {
  it('offline 优先于其它状态，active Task 次优先为 busy', () => {
    expect(deriveRuntimeHealth(health({ runtimeReachable: false, activeTasks: 2 }))).toBe('offline')
    expect(
      deriveRuntimeHealth(
        health({
          activeTasks: 1,
          providers: [{ configured: false }],
          mcp: [{ enabled: true, state: 'error' }]
        })
      )
    ).toBe('busy')
  })

  it('Provider 全未配置或关键配置异常时 degraded', () => {
    expect(deriveRuntimeHealth(health({ providers: [] }))).toBe('degraded')
    expect(deriveRuntimeHealth(health({ providers: [{ configured: false }] }))).toBe('degraded')
    expect(deriveRuntimeHealth(health({ criticalConfigError: true }))).toBe('degraded')
  })

  it('仅启用 MCP 的 error 降级；禁用 MCP 与 Shell 安全默认不降级', () => {
    expect(
      deriveRuntimeHealth(health({ mcp: [{ enabled: true, state: 'error' }] }))
    ).toBe('degraded')
    expect(
      deriveRuntimeHealth(health({ mcp: [{ enabled: false, state: 'error' }] }))
    ).toBe('ready')
    expect(deriveRuntimeHealth(health())).toBe('ready')
  })
})

describe('queryUsage7d', () => {
  it('单条 SQL 聚合七日边界内 runs、calls、tokens 与 cost', () => {
    let prepareCount = 0
    const db = usageDb(
      {
        runs: 2,
        modelCalls: 2,
        toolCalls: 2,
        tokensIn: 40,
        tokensOut: 60,
        costUsd: 1
      },
      (sql, params) => {
        prepareCount += 1
        expect(sql).toContain('FROM runs WHERE started_at >= @cutoff AND started_at <= @now')
        expect(sql).toContain(
          'FROM model_calls WHERE created_at >= @cutoff AND created_at <= @now'
        )
        expect(sql).toContain(
          'FROM tool_calls WHERE started_at >= @cutoff AND started_at <= @now'
        )
        expect(params).toEqual([
          {
            cutoff: '2026-07-16T00:00:00.000Z',
            now: '2026-07-23T00:00:00.000Z'
          }
        ])
      }
    )

    expect(queryUsage7d(db, '2026-07-23T00:00:00.000Z')).toEqual({
      runs: 2,
      modelCalls: 2,
      toolCalls: 2,
      tokensIn: 40,
      tokensOut: 60,
      costUsd: 1
    })
    expect(prepareCount).toBe(1)
  })

  it('空数据库稳定返回全 0', () => {
    const db = usageDb({
      runs: 0,
      modelCalls: 0,
      toolCalls: 0,
      tokensIn: null,
      tokensOut: null,
      costUsd: null
    })
    expect(queryUsage7d(db, '2026-07-23T00:00:00.000Z')).toEqual({
      runs: 0,
      modelCalls: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0
    })
  })
})

describe('buildRuntimeOverview', () => {
  it('旧版单 API Key 作为可执行 Provider 投影，不误报 degraded', () => {
    const db = usageDb({
      runs: 0,
      modelCalls: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0
    })
    const overview = buildRuntimeOverview({
      db,
      config: {
        ...CONFIG,
        apiKey: 'legacy-secret',
        model: 'legacy-model',
        providers: [],
        defaultProviderId: null
      },
      mcpStatuses: [],
      activeTasks: 0,
      queuedTasks: 0,
      startedAt: '2026-07-23T01:00:00.000Z',
      now: '2026-07-23T02:00:00.000Z'
    })

    expect(overview.overall).toBe('ready')
    expect(overview.providers).toEqual([
      expect.objectContaining({
        id: 'legacy-anthropic',
        name: 'Anthropic',
        configured: true,
        defaultModel: 'legacy-model'
      })
    ])
    expect(JSON.stringify(overview)).not.toContain('legacy-secret')
    expect(
      resolveProviderForConnectionTest(overview.providers[0].id, {
        ...CONFIG,
        apiKey: 'legacy-secret',
        model: 'legacy-model',
        providers: [],
        defaultProviderId: null
      })
    ).toMatchObject({
      id: 'legacy-anthropic',
      name: 'Anthropic',
      defaultModel: 'legacy-model',
      apiKey: 'legacy-secret'
    })
  })

  it('只投影安全字段，MCP 原始错误、Provider key、env 与工具描述不泄漏', () => {
    const db = usageDb({
      runs: 0,
      modelCalls: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0
    })
    const secret = 'sk-private /Users/private/customer.txt prompt artifact content'
    const config: RuntimeConfig = {
      ...CONFIG,
      providers: [{ ...CONFIG.providers[0], apiKey: secret }],
      mcpServers: [
        {
          id: 'm1',
          name: 'Safe MCP',
          command: '/private/bin/server',
          args: ['--secret', secret],
          enabled: true,
          env: { PRIVATE_TOKEN: secret }
        }
      ],
      shellEnabled: true,
      shellAllowPrefixes: ['git status']
    }
    const mcpStatuses: McpServerStatus[] = [
      {
        id: 'm1',
        name: 'Safe MCP',
        enabled: true,
        state: 'error',
        error: secret,
        tools: [
          {
            toolId: 'mcp:m1:secret',
            name: 'secret-tool',
            description: secret,
            risk: 'approval_required'
          }
        ]
      }
    ]

    const overview = buildRuntimeOverview({
      db,
      config,
      mcpStatuses,
      activeTasks: 0,
      queuedTasks: 0,
      startedAt: '2026-07-23T01:00:00.000Z',
      now: '2026-07-23T02:00:00.000Z'
    })
    const json = JSON.stringify(overview)

    expect(overview.overall).toBe('degraded')
    expect(overview.providers[0]).toMatchObject({
      id: 'p1',
      configured: true,
      lastTestStatus: 'unknown',
      lastTestedAt: null,
      errorSummary: null
    })
    expect(overview.mcp[0]).toEqual({
      id: 'm1',
      name: 'Safe MCP',
      state: 'error',
      toolCount: 1,
      errorSummary: '连接失败'
    })
    expect(overview.shell).toEqual({
      enabled: true,
      allowPrefixCount: 1,
      risk: 'approval_required'
    })
    expect(json).not.toContain(secret)
    expect(json).not.toContain('/Users/private')
    expect(json).not.toContain('apiKey')
    expect(json).not.toContain('PRIVATE_TOKEN')
  })

  it('Runtime offline 回退不伪造配置或使用量', () => {
    expect(createOfflineRuntimeOverview()).toEqual({
      overall: 'offline',
      runtime: {
        state: 'offline',
        startedAt: null,
        activeTasks: 0,
        queuedTasks: 0,
        maxActiveTasks: 0
      },
      providers: [],
      mcp: [],
      shell: {
        enabled: false,
        allowPrefixCount: 0,
        risk: 'forbidden'
      },
      usage7d: {
        runs: 0,
        modelCalls: 0,
        toolCalls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0
      }
    })
  })

  it('Runtime offline 基于最后安全快照保留历史配置与用量，只清空当前执行态', () => {
    const previous = createOfflineRuntimeOverview()
    previous.overall = 'ready'
    previous.runtime = {
      state: 'ready',
      startedAt: '2026-07-23T01:00:00.000Z',
      activeTasks: 2,
      queuedTasks: 3,
      maxActiveTasks: 4
    }
    previous.providers = [
      {
        id: 'p1',
        name: 'Provider',
        configured: true,
        defaultModel: 'model',
        lastTestStatus: 'unknown',
        lastTestedAt: null,
        errorSummary: null
      }
    ]
    previous.usage7d = {
      runs: 7,
      modelCalls: 8,
      toolCalls: 9,
      tokensIn: 10,
      tokensOut: 11,
      costUsd: 1.25
    }

    expect(createOfflineRuntimeOverview(previous)).toMatchObject({
      overall: 'offline',
      runtime: {
        state: 'offline',
        startedAt: null,
        activeTasks: 0,
        queuedTasks: 0,
        maxActiveTasks: 4
      },
      providers: previous.providers,
      usage7d: previous.usage7d
    })
  })
})
