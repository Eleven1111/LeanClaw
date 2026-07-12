import type { ModelTier, ProviderKind, RiskLevel } from '../shared/types'

export interface McpServerRuntimeConfig {
  id: string
  name: string
  command: string
  args: string[]
  enabled: boolean
  env: Record<string, string>
}

export type McpToolRiskMap = Record<string, RiskLevel>

export interface ProviderConfig {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
  inputPricePerM: number | null
  outputPricePerM: number | null
  apiKey: string | null
}

export interface TierFallback {
  providerId: string
  model: string
}

export interface TierRoute {
  providerId: string
  model: string
  fallback?: TierFallback
}

export type TierMap = Partial<Record<ModelTier, TierRoute>>

export interface RuntimeConfig {
  apiKey: string | null
  model: string
  maxActiveTasks: number
  defaultBudgetUsd: number
  providers: ProviderConfig[]
  defaultProviderId: string | null
  tierMap: TierMap
  mcpServers: McpServerRuntimeConfig[]
  mcpToolRisk: McpToolRiskMap
  shellEnabled: boolean
  shellAllowPrefixes: string[]
}

export interface RuntimeConfigOverride {
  apiKey?: string | null
  model?: string
  maxActiveTasks?: number
  defaultBudgetUsd?: number
  providers?: ProviderConfig[]
  defaultProviderId?: string | null
  tierMap?: TierMap
  mcpServers?: McpServerRuntimeConfig[]
  mcpToolRisk?: McpToolRiskMap
  shellEnabled?: boolean
  shellAllowPrefixes?: string[]
}

export const DEFAULT_MODEL = 'claude-sonnet-5'
export const DEFAULT_MAX_ACTIVE_TASKS = 3

function normalizePositiveInt(v: number | undefined): number | undefined {
  if (v === undefined || !Number.isFinite(v)) return undefined
  const n = Math.floor(v)
  return n >= 1 ? n : undefined
}

function normalizeNonNegative(v: number | undefined): number | undefined {
  if (v === undefined || !Number.isFinite(v) || v < 0) return undefined
  return v
}

function parseProvidersEnv(raw: string | undefined): ProviderConfig[] | undefined {
  if (!raw) return undefined
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return undefined
    return arr
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        id: String(p.id ?? ''),
        name: String(p.name ?? ''),
        kind: (p.kind === 'anthropic' ? 'anthropic' : 'openai-compat') as ProviderKind,
        baseUrl: String(p.baseUrl ?? ''),
        defaultModel: String(p.defaultModel ?? ''),
        inputPricePerM: typeof p.inputPricePerM === 'number' ? p.inputPricePerM : null,
        outputPricePerM: typeof p.outputPricePerM === 'number' ? p.outputPricePerM : null,
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : null
      }))
      .filter((p) => p.id.length > 0)
  } catch {
    return undefined
  }
}

function parseMcpServersEnv(raw: string | undefined): McpServerRuntimeConfig[] | undefined {
  if (!raw) return undefined
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return undefined
    return arr
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => {
        const env: Record<string, string> = {}
        if (s.env && typeof s.env === 'object' && !Array.isArray(s.env)) {
          for (const [k, v] of Object.entries(s.env as Record<string, unknown>)) {
            if (typeof v === 'string') env[k] = v
          }
        }
        return {
          id: String(s.id ?? ''),
          name: String(s.name ?? ''),
          command: String(s.command ?? ''),
          args: Array.isArray(s.args) ? s.args.map((a) => String(a)) : [],
          enabled: s.enabled !== false,
          env
        }
      })
      .filter((s) => s.id.length > 0 && s.command.length > 0)
  } catch {
    return undefined
  }
}

const TIER_IDS: ModelTier[] = ['planning', 'generation', 'extraction', 'review']

function parseTierRoute(raw: unknown): TierRoute | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.providerId !== 'string' || typeof r.model !== 'string') return undefined
  const route: TierRoute = { providerId: r.providerId, model: r.model }
  if (r.fallback && typeof r.fallback === 'object') {
    const f = r.fallback as Record<string, unknown>
    if (typeof f.providerId === 'string' && typeof f.model === 'string') {
      route.fallback = { providerId: f.providerId, model: f.model }
    }
  }
  return route
}

function parseTierMapEnv(raw: string | undefined): TierMap | undefined {
  if (!raw) return undefined
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return undefined
    const out: TierMap = {}
    for (const tier of TIER_IDS) {
      const route = parseTierRoute((obj as Record<string, unknown>)[tier])
      if (route) out[tier] = route
    }
    return out
  } catch {
    return undefined
  }
}

function parseShellAllowEnv(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').filter((p) => p.length > 0)
}

export function resolveConfig(
  envKey: string | undefined,
  envModel: string | undefined,
  override: RuntimeConfigOverride,
  envMaxActive?: string,
  envProviders?: string,
  envTierMap?: string,
  envMcpServers?: string,
  envShell?: string,
  envShellAllow?: string
): RuntimeConfig {
  const apiKey =
    'apiKey' in override
      ? override.apiKey && override.apiKey.length > 0
        ? override.apiKey
        : null
      : envKey && envKey.trim().length > 0
        ? envKey.trim()
        : null
  const model = override.model?.trim() || envModel?.trim() || DEFAULT_MODEL
  const maxActiveTasks =
    normalizePositiveInt(override.maxActiveTasks) ??
    normalizePositiveInt(envMaxActive !== undefined ? Number(envMaxActive) : undefined) ??
    DEFAULT_MAX_ACTIVE_TASKS
  const defaultBudgetUsd = normalizeNonNegative(override.defaultBudgetUsd) ?? 0
  const providers = override.providers ?? parseProvidersEnv(envProviders) ?? []
  const defaultProviderId =
    'defaultProviderId' in override ? override.defaultProviderId ?? null : null
  const tierMap = override.tierMap ?? parseTierMapEnv(envTierMap) ?? {}
  const mcpServers = override.mcpServers ?? parseMcpServersEnv(envMcpServers) ?? []
  const mcpToolRisk = override.mcpToolRisk ?? {}
  const shellEnabled = override.shellEnabled ?? envShell === '1'
  const shellAllowPrefixes = override.shellAllowPrefixes ?? parseShellAllowEnv(envShellAllow)
  return {
    apiKey,
    model,
    maxActiveTasks,
    defaultBudgetUsd,
    providers,
    defaultProviderId,
    tierMap,
    mcpServers,
    mcpToolRisk,
    shellEnabled,
    shellAllowPrefixes
  }
}

let override: RuntimeConfigOverride = {}

export function setRuntimeConfig(patch: RuntimeConfigOverride): void {
  override = { ...override, ...patch }
}

export function getRuntimeConfig(): RuntimeConfig {
  return resolveConfig(
    process.env.ANTHROPIC_API_KEY,
    process.env.LEANCLAW_MODEL,
    override,
    process.env.LEANCLAW_MAX_ACTIVE,
    process.env.LEANCLAW_SMOKE_PROVIDERS,
    process.env.LEANCLAW_TIERMAP,
    process.env.LEANCLAW_MCP_SERVERS,
    process.env.LEANCLAW_SHELL,
    process.env.LEANCLAW_SHELL_ALLOW
  )
}
