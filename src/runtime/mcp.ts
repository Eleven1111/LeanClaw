import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { getRuntimeConfig } from './config'
import type { McpServerRuntimeConfig, McpToolRiskMap } from './config'
import { registerDynamicTool, unregisterTool } from './tools'
import { ToolError, type ToolDefinition } from './tool-types'
import { extractMcpText, mcpToolId, resolveMcpRisk } from '../shared/mcp'
import type { McpServerState, McpServerStatus } from '../shared/types'
import { assertTestIsolationEnvironment } from './test-isolation'

interface ToolMeta {
  toolId: string
  name: string
  description: string
}

interface ServerState {
  config: McpServerRuntimeConfig
  state: McpServerState
  error?: string
  toolMetas: ToolMeta[]
  client?: Client
  transport?: StdioClientTransport
  reconnectAttempted: boolean
  connecting: boolean
  intentionalClose: boolean
}

interface ListedTool {
  name: string
  description?: string
  annotations?: { title?: string }
}

const states = new Map<string, ServerState>()
let toolRiskOverrides: McpToolRiskMap = {}

function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === 'string' && v.length > 400 ? v.slice(0, 400) + `…(${v.length} chars)` : v
  }
  return out
}

function makeMcpToolDefinition(
  serverId: string,
  toolName: string,
  description: string,
  client: Client
): ToolDefinition {
  const id = mcpToolId(serverId, toolName)
  return {
    id,
    name: toolName,
    version: '1.0.0',
    provider: 'mcp',
    description,
    baseRisk: 'approval_required',
    riskFor: () => resolveMcpRisk(toolRiskOverrides, id),
    dryRun(input) {
      return {
        summary: `将调用 MCP 工具 ${toolName}`,
        data: { diff: JSON.stringify(sanitizeInput(input), null, 2) }
      }
    },
    async execute(input) {
      let res: { content?: unknown; isError?: unknown }
      try {
        res = (await client.callTool({ name: toolName, arguments: input })) as {
          content?: unknown
          isError?: unknown
        }
      } catch (e) {
        throw new ToolError(`MCP 工具调用失败：${(e as Error).message}`, true)
      }
      const text = extractMcpText(res.content)
      if (res.isError) {
        throw new ToolError(text || `MCP 工具「${toolName}」返回错误`, true)
      }
      const summary = text.length > 0 ? text : `MCP 工具「${toolName}」已执行`
      return { summary, data: { text: summary } }
    }
  }
}

function unregisterTools(st: ServerState): void {
  for (const t of st.toolMetas) unregisterTool(t.toolId)
  st.toolMetas = []
}

function registerTools(st: ServerState, client: Client, tools: ListedTool[]): void {
  unregisterTools(st)
  const metas: ToolMeta[] = []
  for (const t of tools) {
    const toolId = mcpToolId(st.config.id, t.name)
    const description = t.description ?? t.annotations?.title ?? ''
    metas.push({ toolId, name: t.name, description })
    registerDynamicTool(makeMcpToolDefinition(st.config.id, t.name, description, client))
  }
  st.toolMetas = metas
}

function handleDrop(serverId: string, reason: string): void {
  const st = states.get(serverId)
  if (!st || st.intentionalClose || st.connecting) return
  unregisterTools(st)
  st.client = undefined
  st.transport = undefined
  st.state = 'error'
  st.error = reason
  if (!st.reconnectAttempted) {
    st.reconnectAttempted = true
    void attemptConnect(serverId)
  } else {
    st.state = 'disabled'
    st.error = `${reason}（重连失败，已停用至重启）`
  }
}

async function attemptConnect(serverId: string): Promise<void> {
  const st = states.get(serverId)
  if (!st) return
  st.intentionalClose = false
  st.connecting = true
  st.state = 'connecting'
  st.error = undefined
  const cfg = st.config
  let transport: StdioClientTransport | undefined
  try {
    const childEnv = { ...getDefaultEnvironment(), ...cfg.env }
    if (process.env.LEANCLAW_TEST_ROOT) {
      assertTestIsolationEnvironment()
      childEnv.LEANCLAW_TEST_ROOT = process.env.LEANCLAW_TEST_ROOT
      childEnv.LEANCLAW_DATA_DIR = process.env.LEANCLAW_DATA_DIR as string
      childEnv.HOME = process.env.HOME as string
      childEnv.TMPDIR = process.env.TMPDIR as string
    }
    transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: childEnv
    })
    transport.onclose = (): void => handleDrop(serverId, 'MCP Server 连接已关闭')
    transport.onerror = (e): void => handleDrop(serverId, e.message)
    const client = new Client({ name: 'leanclaw-mcp', version: '1.0.0' })
    await client.connect(transport)
    const listed = (await client.listTools()) as { tools?: ListedTool[] }
    st.client = client
    st.transport = transport
    st.connecting = false
    st.reconnectAttempted = false
    registerTools(st, client, listed.tools ?? [])
    st.state = 'connected'
    st.error = undefined
  } catch (e) {
    st.connecting = false
    if (transport) {
      transport.onclose = undefined
      transport.onerror = undefined
      try {
        await transport.close()
      } catch {
        // ignore
      }
    }
    handleDrop(serverId, (e as Error).message)
  }
}

async function disconnect(serverId: string): Promise<void> {
  const st = states.get(serverId)
  if (!st) return
  st.intentionalClose = true
  unregisterTools(st)
  const client = st.client
  st.client = undefined
  st.transport = undefined
  st.state = 'disabled'
  if (client) {
    try {
      await client.close()
    } catch {
      // ignore
    }
  }
}

async function reconnect(serverId: string): Promise<void> {
  await disconnect(serverId)
  const st = states.get(serverId)
  if (!st) return
  st.reconnectAttempted = false
  await attemptConnect(serverId)
}

function connectionParamsChanged(a: McpServerRuntimeConfig, b: McpServerRuntimeConfig): boolean {
  return (
    a.command !== b.command ||
    JSON.stringify(a.args) !== JSON.stringify(b.args) ||
    JSON.stringify(a.env) !== JSON.stringify(b.env)
  )
}

export function syncMcpFromConfig(): void {
  const cfg = getRuntimeConfig()
  toolRiskOverrides = cfg.mcpToolRisk
  const desired = new Map(cfg.mcpServers.map((s) => [s.id, s]))
  for (const id of [...states.keys()]) {
    if (!desired.has(id)) {
      void disconnect(id)
      states.delete(id)
    }
  }
  for (const s of cfg.mcpServers) {
    const existing = states.get(s.id)
    if (!existing) {
      states.set(s.id, {
        config: s,
        state: s.enabled ? 'connecting' : 'disabled',
        toolMetas: [],
        reconnectAttempted: false,
        connecting: false,
        intentionalClose: false
      })
      if (s.enabled) void attemptConnect(s.id)
      continue
    }
    const changed = connectionParamsChanged(existing.config, s)
    existing.config = s
    if (!s.enabled) {
      if (existing.state !== 'disabled' || existing.client) void disconnect(s.id)
    } else if (changed) {
      void reconnect(s.id)
    } else if (existing.state !== 'connected' && !existing.connecting) {
      existing.reconnectAttempted = false
      void attemptConnect(s.id)
    }
  }
}

export function getMcpStatus(): McpServerStatus[] {
  return [...states.values()].map((st) => ({
    id: st.config.id,
    name: st.config.name,
    enabled: st.config.enabled,
    state: st.state,
    error: st.error,
    tools: st.toolMetas.map((t) => ({
      toolId: t.toolId,
      name: t.name,
      description: t.description,
      risk: resolveMcpRisk(toolRiskOverrides, t.toolId)
    }))
  }))
}

export async function shutdownAllMcp(): Promise<void> {
  await Promise.all([...states.keys()].map((id) => disconnect(id)))
  states.clear()
}
