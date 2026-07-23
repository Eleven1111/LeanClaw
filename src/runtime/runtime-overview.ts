import { getRuntimeConfig, type McpServerRuntimeConfig, type RuntimeConfig } from './config'
import { getDb } from './db'
import { getMcpStatus } from './mcp'
import { getSchedulerSnapshot } from './scheduler'
import { deriveRuntimeHealth, LEGACY_PROVIDER_ID } from '../shared/runtime-health'
import type {
  McpServerState,
  McpServerStatus,
  RuntimeOverviewView
} from '../shared/types'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const RUNTIME_STARTED_AT = new Date().toISOString()

export interface RuntimeOverviewDatabase {
  prepare(sql: string): {
    get(...params: unknown[]): unknown
  }
}

interface BuildRuntimeOverviewInput {
  db: RuntimeOverviewDatabase
  config: RuntimeConfig
  mcpStatuses: McpServerStatus[]
  activeTasks: number
  queuedTasks: number
  startedAt: string
  now: string
  criticalConfigError?: boolean
}

interface UsageRow {
  runs: number | null
  modelCalls: number | null
  toolCalls: number | null
  tokensIn: number | null
  tokensOut: number | null
  costUsd: number | null
}

function finiteNonNegative(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function queryUsage7d(
  db: RuntimeOverviewDatabase,
  now: string
): RuntimeOverviewView['usage7d'] {
  const nowMs = Date.parse(now)
  if (!Number.isFinite(nowMs)) throw new Error('Runtime Overview 时间无效')
  const cutoff = new Date(nowMs - SEVEN_DAYS_MS).toISOString()
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM runs WHERE started_at >= @cutoff AND started_at <= @now) AS runs,
         (SELECT COUNT(*) FROM model_calls WHERE created_at >= @cutoff AND created_at <= @now) AS modelCalls,
         (SELECT COUNT(*) FROM tool_calls WHERE started_at >= @cutoff AND started_at <= @now) AS toolCalls,
         (SELECT COALESCE(SUM(tokens_in), 0) FROM model_calls WHERE created_at >= @cutoff AND created_at <= @now) AS tokensIn,
         (SELECT COALESCE(SUM(tokens_out), 0) FROM model_calls WHERE created_at >= @cutoff AND created_at <= @now) AS tokensOut,
         (SELECT COALESCE(SUM(cost_usd), 0) FROM model_calls WHERE created_at >= @cutoff AND created_at <= @now) AS costUsd`
    )
    .get({ cutoff, now: new Date(nowMs).toISOString() }) as UsageRow
  return {
    runs: finiteNonNegative(row.runs),
    modelCalls: finiteNonNegative(row.modelCalls),
    toolCalls: finiteNonNegative(row.toolCalls),
    tokensIn: finiteNonNegative(row.tokensIn),
    tokensOut: finiteNonNegative(row.tokensOut),
    costUsd: finiteNonNegative(row.costUsd)
  }
}

function projectMcpState(
  config: McpServerRuntimeConfig,
  status: McpServerStatus | undefined
): McpServerState {
  if (!config.enabled) return 'disabled'
  if (!status) return 'connecting'
  if (status.state === 'disabled' && status.error) return 'error'
  return status.state
}

export function buildRuntimeOverview(
  input: BuildRuntimeOverviewInput
): RuntimeOverviewView {
  const providers: RuntimeOverviewView['providers'] = input.config.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    configured: typeof provider.apiKey === 'string' && provider.apiKey.trim().length > 0,
    defaultModel: provider.defaultModel,
    lastTestStatus: 'unknown' as const,
    lastTestedAt: null,
    errorSummary: null
  }))
  if (
    typeof input.config.apiKey === 'string' &&
    input.config.apiKey.trim().length > 0 &&
    !providers.some((provider) => provider.id === LEGACY_PROVIDER_ID)
  ) {
    providers.unshift({
      id: LEGACY_PROVIDER_ID,
      name: 'Anthropic',
      configured: true,
      defaultModel: input.config.model,
      lastTestStatus: 'unknown',
      lastTestedAt: null,
      errorSummary: null
    })
  }
  const statusById = new Map(input.mcpStatuses.map((status) => [status.id, status]))
  const mcpWithHealth = input.config.mcpServers.map((server) => {
    const status = statusById.get(server.id)
    const state = projectMcpState(server, status)
    return {
      enabled: server.enabled,
      view: {
        id: server.id,
        name: server.name,
        state,
        toolCount: status?.tools.length ?? 0,
        errorSummary: state === 'error' ? '连接失败' : null
      }
    }
  })
  const overall = deriveRuntimeHealth({
    runtimeReachable: true,
    activeTasks: input.activeTasks,
    providers,
    mcp: mcpWithHealth.map(({ enabled, view }) => ({ enabled, state: view.state })),
    criticalConfigError: input.criticalConfigError ?? false
  })

  return {
    overall,
    runtime: {
      state: input.activeTasks > 0 ? 'busy' : 'ready',
      startedAt: input.startedAt,
      activeTasks: input.activeTasks,
      queuedTasks: input.queuedTasks,
      maxActiveTasks: input.config.maxActiveTasks
    },
    providers,
    mcp: mcpWithHealth.map(({ view }) => view),
    shell: {
      enabled: input.config.shellEnabled,
      allowPrefixCount: input.config.shellAllowPrefixes.length,
      risk: input.config.shellEnabled ? 'approval_required' : 'forbidden'
    },
    usage7d: queryUsage7d(input.db, input.now)
  }
}

export function resolveProviderForConnectionTest(
  providerId: string,
  config: RuntimeConfig
): RuntimeConfig['providers'][number] | null {
  const configured = config.providers.find((provider) => provider.id === providerId)
  if (configured) return configured
  if (
    providerId !== LEGACY_PROVIDER_ID ||
    typeof config.apiKey !== 'string' ||
    config.apiKey.trim().length === 0
  ) {
    return null
  }
  return {
    id: LEGACY_PROVIDER_ID,
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: '',
    defaultModel: config.model,
    inputPricePerM: null,
    outputPricePerM: null,
    apiKey: config.apiKey
  }
}

export function getRuntimeOverview(): RuntimeOverviewView {
  const scheduler = getSchedulerSnapshot()
  return buildRuntimeOverview({
    db: getDb(),
    config: getRuntimeConfig(),
    mcpStatuses: getMcpStatus(),
    activeTasks: scheduler.activeTasks,
    queuedTasks: scheduler.queuedTasks,
    startedAt: RUNTIME_STARTED_AT,
    now: new Date().toISOString()
  })
}
