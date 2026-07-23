import type { McpServerState, RuntimeOverviewView } from './types'

export const LEGACY_PROVIDER_ID = 'legacy-anthropic'

export interface RuntimeHealthInput {
  runtimeReachable: boolean
  activeTasks: number
  providers: Array<{ configured: boolean }>
  mcp: Array<{ enabled: boolean; state: McpServerState }>
  criticalConfigError: boolean
}

export function deriveRuntimeHealth(
  input: RuntimeHealthInput
): RuntimeOverviewView['overall'] {
  if (!input.runtimeReachable) return 'offline'
  if (input.activeTasks > 0) return 'busy'
  if (
    input.criticalConfigError ||
    input.providers.length === 0 ||
    input.providers.every((provider) => !provider.configured) ||
    input.mcp.some((server) => server.enabled && server.state === 'error')
  ) {
    return 'degraded'
  }
  return 'ready'
}

export function createOfflineRuntimeOverview(
  previous?: RuntimeOverviewView | null
): RuntimeOverviewView {
  return {
    overall: 'offline',
    runtime: {
      state: 'offline',
      startedAt: null,
      activeTasks: 0,
      queuedTasks: 0,
      maxActiveTasks: previous?.runtime.maxActiveTasks ?? 0
    },
    providers: previous?.providers.map((provider) => ({ ...provider })) ?? [],
    mcp: previous?.mcp.map((server) => ({ ...server })) ?? [],
    shell: previous
      ? { ...previous.shell }
      : {
          enabled: false,
          allowPrefixCount: 0,
          risk: 'forbidden'
        },
    usage7d: previous
      ? { ...previous.usage7d }
      : {
          runs: 0,
          modelCalls: 0,
          toolCalls: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0
        }
  }
}
