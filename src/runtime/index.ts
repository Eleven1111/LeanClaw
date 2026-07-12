import { homedir } from 'os'
import { join } from 'path'
import { initDb } from './db'
import { handleRpc, recoverAfterRestart } from './api'
import { subscribe } from './bus'
import { runSmoke } from './smoke'
import { setRuntimeConfig } from './config'
import type {
  McpServerRuntimeConfig,
  McpToolRiskMap,
  ProviderConfig,
  RuntimeConfigOverride,
  TierMap
} from './config'
import { syncMcpFromConfig } from './mcp'
import type { RpcRequest } from '../shared/types'

type ParentMessage =
  | { id: number; req: RpcRequest; kind?: undefined }
  | {
      kind: 'config'
      apiKey?: string | null
      model?: string
      maxActiveTasks?: number
      defaultBudgetUsd?: number
      providers?: ProviderConfig[]
      defaultProviderId?: string | null
      tierMap?: TierMap
      mcpServers?: McpServerRuntimeConfig[]
      mcpToolRisk?: McpToolRiskMap
    }

interface ParentPort {
  on(event: 'message', listener: (e: { data: ParentMessage }) => void): void
  postMessage(message: unknown): void
}

const dataDir = process.env.LEANCLAW_DATA_DIR || join(homedir(), '.leanclaw')
initDb(dataDir)
recoverAfterRestart()

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort

if (parentPort) {
  subscribe((event) => parentPort.postMessage({ kind: 'push', event }))
  parentPort.on('message', (e) => {
    const msg = e.data
    if (msg.kind === 'config') {
      const patch: RuntimeConfigOverride = {}
      if ('apiKey' in msg) patch.apiKey = msg.apiKey ?? null
      if (msg.model !== undefined) patch.model = msg.model
      if (msg.maxActiveTasks !== undefined) patch.maxActiveTasks = msg.maxActiveTasks
      if (msg.defaultBudgetUsd !== undefined) patch.defaultBudgetUsd = msg.defaultBudgetUsd
      if (msg.providers !== undefined) patch.providers = msg.providers
      if ('defaultProviderId' in msg) patch.defaultProviderId = msg.defaultProviderId ?? null
      if (msg.tierMap !== undefined) patch.tierMap = msg.tierMap
      if (msg.mcpServers !== undefined) patch.mcpServers = msg.mcpServers
      if (msg.mcpToolRisk !== undefined) patch.mcpToolRisk = msg.mcpToolRisk
      setRuntimeConfig(patch)
      if (msg.mcpServers !== undefined || msg.mcpToolRisk !== undefined) syncMcpFromConfig()
      return
    }
    const { id, req } = msg
    handleRpc(req)
      .then((result) => parentPort.postMessage({ kind: 'rpc-result', id, result }))
      .catch((err: Error) => parentPort.postMessage({ kind: 'rpc-result', id, error: err.message }))
  })
  parentPort.postMessage({ kind: 'ready', dataDir })
} else if (process.env.LEANCLAW_SMOKE === '1') {
  void runSmoke()
} else {
  process.stderr.write(
    'runtime 以独立进程启动但没有 parentPort；如需 CLI 冒烟测试请设置 LEANCLAW_SMOKE=1\n'
  )
  process.exit(2)
}
