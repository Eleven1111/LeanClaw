import { homedir } from 'os'
import { join } from 'path'
import { getDb, initDb } from './db'
import { handleRpc, recoverAfterRestart, syncCustomRecipes } from './api'
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
import type { TaskView } from '../shared/types'
import { startScheduleLoop } from './schedules'
import { appendDiagnosticEvent } from '../main/diagnostics'

type ParentMessage =
  | { id: number; req: RpcRequest; kind?: undefined }
  | {
      kind: 'config'
      apiKey?: string | null
      model?: string
      maxActiveTasks?: number
      defaultBudgetUsd?: number
      snapshotQuotaMb?: number
      providers?: ProviderConfig[]
      defaultProviderId?: string | null
      tierMap?: TierMap
      mcpServers?: McpServerRuntimeConfig[]
      mcpToolRisk?: McpToolRiskMap
      shellEnabled?: boolean
      shellAllowPrefixes?: string[]
    }

interface ParentPort {
  on(event: 'message', listener: (e: { data: ParentMessage }) => void): void
  postMessage(message: unknown): void
}

const dataDir = process.env.LEANCLAW_DATA_DIR || join(homedir(), '.leanclaw')
const runtimePrivateRoots = [dataDir, homedir()]
const logRuntime = (event: string, options: { level?: 'info' | 'error'; code?: string | number; error?: unknown } = {}): void => {
  try {
    appendDiagnosticEvent({
      logDir: join(dataDir, 'logs'),
      process: 'runtime',
      level: options.level ?? 'info',
      event,
      ...(options.code === undefined ? {} : { code: options.code }),
      ...(options.error === undefined ? {} : { error: options.error }),
      privateRoots: runtimePrivateRoots
    })
  } catch {
    // Diagnostics must never interfere with task execution.
  }
}
process.on('uncaughtExceptionMonitor', (error) => logRuntime('uncaught-exception', { level: 'error', error }))
process.on('exit', (code) => logRuntime('runtime-stopping', { level: code === 0 ? 'info' : 'error', code }))
logRuntime('runtime-starting')
initDb(dataDir)
syncCustomRecipes()
recoverAfterRestart()
startScheduleLoop(async (schedule) => {
  const task = await handleRpc({
    method: 'createTask', goal: schedule.goal, inputPath: schedule.inputPath, recipeId: schedule.recipeId,
    ...(schedule.projectId ? { projectId: schedule.projectId } : {}),
    ...(schedule.agentId ? { agentId: schedule.agentId } : {}),
    ...(schedule.budgetUsd ? { budgetUsd: schedule.budgetUsd } : {})
  }) as TaskView
  getDb().prepare('UPDATE tasks SET schedule_id=? WHERE id=?').run(schedule.id, task.id)
  await handleRpc({ method: 'startTask', taskId: task.id })
})

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
      if (msg.snapshotQuotaMb !== undefined) patch.snapshotQuotaMb = msg.snapshotQuotaMb
      if (msg.providers !== undefined) patch.providers = msg.providers
      if ('defaultProviderId' in msg) patch.defaultProviderId = msg.defaultProviderId ?? null
      if (msg.tierMap !== undefined) patch.tierMap = msg.tierMap
      if (msg.mcpServers !== undefined) patch.mcpServers = msg.mcpServers
      if (msg.mcpToolRisk !== undefined) patch.mcpToolRisk = msg.mcpToolRisk
      if (msg.shellEnabled !== undefined) patch.shellEnabled = msg.shellEnabled
      if (msg.shellAllowPrefixes !== undefined) patch.shellAllowPrefixes = msg.shellAllowPrefixes
      setRuntimeConfig(patch)
      if (msg.mcpServers !== undefined || msg.mcpToolRisk !== undefined) syncMcpFromConfig()
      return
    }
    const { id, req } = msg
    handleRpc(req)
      .then((result) => parentPort.postMessage({ kind: 'rpc-result', id, result }))
      .catch((err: Error) => parentPort.postMessage({ kind: 'rpc-result', id, error: err.message }))
  })
  logRuntime('runtime-ready')
  parentPort.postMessage({ kind: 'ready' })
} else if (process.env.LEANCLAW_SMOKE === '1') {
  void runSmoke()
} else {
  process.stderr.write(
    'runtime 以独立进程启动但没有 parentPort；如需 CLI 冒烟测试请设置 LEANCLAW_SMOKE=1\n'
  )
  process.exit(2)
}
