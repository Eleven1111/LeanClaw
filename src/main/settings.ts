import { app, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { validateMcpServerInput, validateProvider } from '../shared/verify'
import { parseMcpToolId } from '../shared/mcp'
import type {
  McpServerUpsertInput,
  McpServerView,
  ModelTier,
  ProviderKind,
  ProvidersView,
  ProviderUpsertInput,
  ProviderView,
  RiskLevel,
  SettingsView
} from '../shared/types'
import type {
  McpServerRuntimeConfig,
  McpToolRiskMap,
  ProviderConfig,
  TierMap,
  TierRoute
} from '../runtime/config'

const DEFAULT_MODEL = 'claude-sonnet-5'
const DEFAULT_MAX_ACTIVE_TASKS = 3
const KEY_MAX_LENGTH = 512
const MODEL_MAX_LENGTH = 128

interface StoredProvider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
  inputPricePerM: number | null
  outputPricePerM: number | null
}

interface StoredMcpServer {
  id: string
  name: string
  command: string
  args: string[]
  enabled: boolean
}

interface ConfigFile {
  model?: string
  maxActiveTasks?: number
  defaultBudgetUsd?: number
  providers?: StoredProvider[]
  defaultProviderId?: string | null
  tierMap?: TierMap
  mcpServers?: StoredMcpServer[]
  mcpToolRisk?: McpToolRiskMap
  shellEnabled?: boolean
  shellAllowPrefixes?: string[]
}

const SHELL_PREFIX_MAX_LENGTH = 200
const SHELL_PREFIX_MAX_COUNT = 50

const RISK_LEVELS: RiskLevel[] = ['low', 'approval_required', 'forbidden']

const TIER_IDS: ModelTier[] = ['planning', 'generation', 'extraction', 'review']

interface SecretsFile {
  apiKey?: string
  providerKeys?: Record<string, string>
  mcpEnv?: Record<string, string>
}

function secretsPath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function readSecrets(): SecretsFile {
  const path = secretsPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SecretsFile
  } catch {
    return {}
  }
}

function writeSecrets(secrets: SecretsFile): void {
  const path = secretsPath()
  const hasApiKey = typeof secrets.apiKey === 'string' && secrets.apiKey.length > 0
  const keys = secrets.providerKeys ?? {}
  const hasProviderKeys = Object.keys(keys).length > 0
  const mcpEnv = secrets.mcpEnv ?? {}
  const hasMcpEnv = Object.keys(mcpEnv).length > 0
  if (!hasApiKey && !hasProviderKeys && !hasMcpEnv) {
    if (existsSync(path)) rmSync(path)
    return
  }
  const out: SecretsFile = {}
  if (hasApiKey) out.apiKey = secrets.apiKey
  if (hasProviderKeys) out.providerKeys = keys
  if (hasMcpEnv) out.mcpEnv = mcpEnv
  writeFileSync(path, JSON.stringify(out), 'utf8')
}

function readStoredCipher(): string | null {
  const apiKey = readSecrets().apiKey
  return typeof apiKey === 'string' && apiKey.length > 0 ? apiKey : null
}

function decryptCipher(cipher: string | undefined): string | null {
  if (!cipher || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  } catch {
    return null
  }
}

function readConfig(): ConfigFile {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ConfigFile
  } catch {
    return {}
  }
}

function writeConfig(patch: ConfigFile): void {
  writeFileSync(configPath(), JSON.stringify({ ...readConfig(), ...patch }), 'utf8')
}

export function readModel(): string {
  const model = readConfig().model
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : DEFAULT_MODEL
}

export function readMaxActiveTasks(): number {
  const v = readConfig().maxActiveTasks
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10
    ? Math.floor(v)
    : DEFAULT_MAX_ACTIVE_TASKS
}

export function readDefaultBudgetUsd(): number {
  const v = readConfig().defaultBudgetUsd
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function readStoredProviders(): StoredProvider[] {
  const list = readConfig().providers
  return Array.isArray(list) ? list : []
}

export function readDefaultProviderId(): string | null {
  const id = readConfig().defaultProviderId
  if (typeof id !== 'string' || id.length === 0) return null
  return readStoredProviders().some((p) => p.id === id) ? id : null
}

export function readDecryptedKey(): string | null {
  return decryptCipher(readStoredCipher() ?? undefined)
}

export function listProviders(): ProviderView[] {
  const secrets = readSecrets()
  const keys = secrets.providerKeys ?? {}
  return readStoredProviders().map((p) => ({
    ...p,
    hasKey: typeof keys[p.id] === 'string' && keys[p.id].length > 0
  }))
}

export function getProvidersView(): ProvidersView {
  return { providers: listProviders(), defaultProviderId: readDefaultProviderId() }
}

export function readProvidersForRuntime(): ProviderConfig[] {
  const keys = readSecrets().providerKeys ?? {}
  return readStoredProviders().map((p) => ({
    ...p,
    apiKey: decryptCipher(keys[p.id])
  }))
}

export function readShellEnabled(): boolean {
  return readConfig().shellEnabled === true
}

export function readShellAllowPrefixes(): string[] {
  const list = readConfig().shellAllowPrefixes
  return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : []
}

export function getSettings(): SettingsView {
  return {
    hasApiKey: readStoredCipher() !== null,
    model: readModel(),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    maxActiveTasks: readMaxActiveTasks(),
    defaultBudgetUsd: readDefaultBudgetUsd(),
    shellEnabled: readShellEnabled(),
    shellAllowPrefixes: readShellAllowPrefixes()
  }
}

export function setShellEnabled(value: unknown): SettingsView {
  if (typeof value !== 'boolean') throw new Error('开关值必须是布尔值')
  writeConfig({ shellEnabled: value })
  return getSettings()
}

export function setShellAllowPrefixes(value: unknown): SettingsView {
  if (!Array.isArray(value) || !value.every((p) => typeof p === 'string')) {
    throw new Error('白名单前缀必须是字符串数组')
  }
  if (value.length > SHELL_PREFIX_MAX_COUNT) {
    throw new Error(`白名单前缀数量过多（上限 ${SHELL_PREFIX_MAX_COUNT} 条）`)
  }
  const cleaned = value.filter((p) => p.trim().length > 0 && p.length <= SHELL_PREFIX_MAX_LENGTH)
  writeConfig({ shellAllowPrefixes: cleaned })
  return getSettings()
}

export function setKey(key: unknown): SettingsView {
  if (typeof key !== 'string') throw new Error('API Key 必须是字符串')
  const trimmed = key.trim()
  if (trimmed.length === 0) throw new Error('API Key 不能为空')
  if (trimmed.length > KEY_MAX_LENGTH) throw new Error(`API Key 过长（上限 ${KEY_MAX_LENGTH} 字符）`)
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用，无法安全保存 API Key')
  const cipher = safeStorage.encryptString(trimmed).toString('base64')
  writeSecrets({ ...readSecrets(), apiKey: cipher })
  return getSettings()
}

export function clearKey(): SettingsView {
  const secrets = readSecrets()
  delete secrets.apiKey
  writeSecrets(secrets)
  return getSettings()
}

export function setModel(model: unknown): SettingsView {
  if (typeof model !== 'string') throw new Error('模型名必须是字符串')
  const trimmed = model.trim()
  if (trimmed.length === 0) throw new Error('模型名不能为空')
  if (trimmed.length > MODEL_MAX_LENGTH) throw new Error(`模型名过长（上限 ${MODEL_MAX_LENGTH} 字符）`)
  writeConfig({ model: trimmed })
  return getSettings()
}

export function setMaxActiveTasks(value: unknown): SettingsView {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1 || n > 10) throw new Error('并发任务上限必须是 1-10 的整数')
  writeConfig({ maxActiveTasks: Math.floor(n) })
  return getSettings()
}

export function setDefaultBudget(value: unknown): SettingsView {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error('默认预算必须是不小于 0 的数字（0 = 不限）')
  writeConfig({ defaultBudgetUsd: n })
  return getSettings()
}

export function upsertProvider(input: ProviderUpsertInput): ProvidersView {
  const result = validateProvider(input)
  if (!result.ok) throw new Error(result.detail)
  const providers = readStoredProviders()
  const id = typeof input.id === 'string' && input.id.length > 0 ? input.id : randomUUID()
  const next: StoredProvider = { id, ...result.value }
  const idx = providers.findIndex((p) => p.id === id)
  const updated = idx >= 0 ? providers.map((p) => (p.id === id ? next : p)) : [...providers, next]
  writeConfig({ providers: updated })
  return getProvidersView()
}

export function deleteProvider(providerId: string): ProvidersView {
  const providers = readStoredProviders().filter((p) => p.id !== providerId)
  const patch: ConfigFile = { providers }
  if (readConfig().defaultProviderId === providerId) patch.defaultProviderId = null
  writeConfig(patch)
  const secrets = readSecrets()
  if (secrets.providerKeys) {
    delete secrets.providerKeys[providerId]
    writeSecrets(secrets)
  }
  return getProvidersView()
}

export function setProviderKey(providerId: unknown, key: unknown): ProvidersView {
  if (typeof providerId !== 'string' || providerId.length === 0) throw new Error('无效的服务商标识')
  if (!readStoredProviders().some((p) => p.id === providerId)) throw new Error('服务商不存在')
  if (typeof key !== 'string') throw new Error('密钥必须是字符串')
  const trimmed = key.trim()
  if (trimmed.length === 0) throw new Error('密钥不能为空')
  if (trimmed.length > KEY_MAX_LENGTH) throw new Error(`密钥过长（上限 ${KEY_MAX_LENGTH} 字符）`)
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用，无法安全保存密钥')
  const secrets = readSecrets()
  const providerKeys = { ...(secrets.providerKeys ?? {}) }
  providerKeys[providerId] = safeStorage.encryptString(trimmed).toString('base64')
  writeSecrets({ ...secrets, providerKeys })
  return getProvidersView()
}

export function clearProviderKey(providerId: string): ProvidersView {
  const secrets = readSecrets()
  if (secrets.providerKeys) {
    delete secrets.providerKeys[providerId]
    writeSecrets(secrets)
  }
  return getProvidersView()
}

export function setDefaultProvider(providerId: unknown): ProvidersView {
  if (providerId === null || providerId === undefined || providerId === '') {
    writeConfig({ defaultProviderId: null })
    return getProvidersView()
  }
  if (typeof providerId !== 'string' || !readStoredProviders().some((p) => p.id === providerId)) {
    throw new Error('服务商不存在')
  }
  writeConfig({ defaultProviderId: providerId })
  return getProvidersView()
}

function readStoredTierMap(): TierMap {
  const raw = readConfig().tierMap
  return raw && typeof raw === 'object' ? raw : {}
}

export function readTierMap(): TierMap {
  return readStoredTierMap()
}

function assertProviderRef(providerId: string, label: string): void {
  if (providerId === 'mock') return
  if (!readStoredProviders().some((p) => p.id === providerId)) {
    throw new Error(`${label}服务商不存在`)
  }
}

function normalizeRouteModel(model: unknown, label: string): string {
  if (typeof model !== 'string') throw new Error(`${label}必须是字符串`)
  const trimmed = model.trim()
  if (trimmed.length === 0) throw new Error(`${label}不能为空`)
  if (trimmed.length > MODEL_MAX_LENGTH) throw new Error(`${label}过长（上限 ${MODEL_MAX_LENGTH} 字符）`)
  return trimmed
}

export function setTierRoute(
  tier: unknown,
  providerId: unknown,
  model: unknown,
  fallback: { providerId?: unknown; model?: unknown } | null | undefined
): TierMap {
  if (typeof tier !== 'string' || !TIER_IDS.includes(tier as ModelTier)) {
    throw new Error('未知的路由类型: ' + String(tier))
  }
  if (typeof providerId !== 'string' || providerId.length === 0 || providerId === 'mock') {
    throw new Error('主选服务商无效')
  }
  assertProviderRef(providerId, '主选')
  const route: TierRoute = { providerId, model: normalizeRouteModel(model, '主选模型') }
  if (fallback && fallback.providerId) {
    if (typeof fallback.providerId !== 'string') throw new Error('备选服务商无效')
    assertProviderRef(fallback.providerId, '备选')
    route.fallback = {
      providerId: fallback.providerId,
      model: normalizeRouteModel(fallback.model, '备选模型')
    }
  }
  const map = { ...readStoredTierMap(), [tier]: route }
  writeConfig({ tierMap: map })
  return readTierMap()
}

export function clearTierRoute(tier: unknown): TierMap {
  if (typeof tier !== 'string' || !TIER_IDS.includes(tier as ModelTier)) {
    throw new Error('未知的路由类型: ' + String(tier))
  }
  const map = { ...readStoredTierMap() }
  delete map[tier as ModelTier]
  writeConfig({ tierMap: map })
  return readTierMap()
}

function readStoredMcpServers(): StoredMcpServer[] {
  const list = readConfig().mcpServers
  return Array.isArray(list) ? list : []
}

function readStoredMcpToolRisk(): McpToolRiskMap {
  const raw = readConfig().mcpToolRisk
  return raw && typeof raw === 'object' ? raw : {}
}

function encryptEnv(env: Record<string, string>): string {
  return safeStorage.encryptString(JSON.stringify(env)).toString('base64')
}

function decryptEnv(cipher: string | undefined): Record<string, string> {
  const plain = decryptCipher(cipher)
  if (!plain) return {}
  try {
    const obj = JSON.parse(plain)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function readMcpToolRisk(): McpToolRiskMap {
  return readStoredMcpToolRisk()
}

export function listMcpServers(): McpServerView[] {
  const mcpEnv = readSecrets().mcpEnv ?? {}
  return readStoredMcpServers().map((s) => ({
    id: s.id,
    name: s.name,
    command: s.command,
    args: Array.isArray(s.args) ? s.args : [],
    enabled: s.enabled !== false,
    envKeys: Object.keys(decryptEnv(mcpEnv[s.id]))
  }))
}

export function readMcpServersForRuntime(): McpServerRuntimeConfig[] {
  const mcpEnv = readSecrets().mcpEnv ?? {}
  return readStoredMcpServers().map((s) => ({
    id: s.id,
    name: s.name,
    command: s.command,
    args: Array.isArray(s.args) ? s.args : [],
    enabled: s.enabled !== false,
    env: decryptEnv(mcpEnv[s.id])
  }))
}

export function upsertMcpServer(input: McpServerUpsertInput): McpServerView[] {
  const result = validateMcpServerInput(input)
  if (!result.ok) throw new Error(result.detail)
  const hasEnv = input.env !== undefined && input.env !== null
  if (hasEnv && Object.keys(result.value.env ?? {}).length > 0 && !safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密不可用，无法安全保存环境变量')
  }
  const servers = readStoredMcpServers()
  const id = typeof input.id === 'string' && input.id.length > 0 ? input.id : randomUUID()
  const next: StoredMcpServer = {
    id,
    name: result.value.name,
    command: result.value.command,
    args: result.value.args,
    enabled: result.value.enabled
  }
  const idx = servers.findIndex((s) => s.id === id)
  const updated = idx >= 0 ? servers.map((s) => (s.id === id ? next : s)) : [...servers, next]
  writeConfig({ mcpServers: updated })
  if (hasEnv) {
    const secrets = readSecrets()
    const mcpEnv = { ...(secrets.mcpEnv ?? {}) }
    const env = result.value.env ?? {}
    if (Object.keys(env).length > 0) mcpEnv[id] = encryptEnv(env)
    else delete mcpEnv[id]
    writeSecrets({ ...secrets, mcpEnv })
  }
  return listMcpServers()
}

export function deleteMcpServer(serverId: string): McpServerView[] {
  const servers = readStoredMcpServers().filter((s) => s.id !== serverId)
  const risk = { ...readStoredMcpToolRisk() }
  for (const toolId of Object.keys(risk)) {
    const parsed = parseMcpToolId(toolId)
    if (parsed && parsed.serverId === serverId) delete risk[toolId]
  }
  writeConfig({ mcpServers: servers, mcpToolRisk: risk })
  const secrets = readSecrets()
  if (secrets.mcpEnv) {
    delete secrets.mcpEnv[serverId]
    writeSecrets(secrets)
  }
  return listMcpServers()
}

export function setMcpToolRisk(toolId: unknown, risk: unknown): McpToolRiskMap {
  if (typeof toolId !== 'string' || !parseMcpToolId(toolId)) {
    throw new Error('无效的 MCP 工具标识')
  }
  if (typeof risk !== 'string' || !RISK_LEVELS.includes(risk as RiskLevel)) {
    throw new Error('未知的风险等级')
  }
  const parsed = parseMcpToolId(toolId)
  if (parsed && !readStoredMcpServers().some((s) => s.id === parsed.serverId)) {
    throw new Error('MCP Server 不存在')
  }
  const map = { ...readStoredMcpToolRisk(), [toolId]: risk as RiskLevel }
  writeConfig({ mcpToolRisk: map })
  return readMcpToolRisk()
}
