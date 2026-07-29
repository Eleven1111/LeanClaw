import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
  utilityProcess
} from 'electron'
import type { UtilityProcess } from 'electron'
import { writeFile } from 'fs/promises'
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { suggestedExportName } from '../shared/markdown'
import {
  createOfflineRuntimeOverview,
  LEGACY_PROVIDER_ID
} from '../shared/runtime-health'
import type {
  McpServerUpsertInput,
  ModelTier,
  ProviderUpsertInput,
  PushEvent,
  RpcRequest,
  RuntimeOverviewView,
  SetMcpToolRiskInput,
  SetTierRouteInput
} from '../shared/types'
import type {
  McpServerRuntimeConfig,
  McpToolRiskMap,
  ProviderConfig,
  TierMap
} from '../runtime/config'
import {
  clearKey,
  clearProviderKey,
  clearTierRoute,
  deleteMcpServer,
  deleteProvider,
  getProvidersView,
  getSettings,
  listMcpServers,
  readDecryptedKey,
  readDefaultBudgetUsd,
  readDefaultProviderId,
  readMaxActiveTasks,
  readMcpServersForRuntime,
  readMcpToolRisk,
  readModel,
  readProvidersForRuntime,
  readShellAllowPrefixes,
  readShellEnabled,
  readSnapshotQuotaMb,
  readTierMap,
  setDefaultBudget,
  setDefaultProvider,
  setKey,
  setMaxActiveTasks,
  setMcpToolRisk,
  setModel,
  setProviderKey,
  setShellAllowPrefixes,
  setShellEnabled,
  setSnapshotQuotaMb,
  setTierRoute,
  upsertMcpServer,
  upsertProvider
} from './settings'
import { buildTrayIconDataURL } from './trayIcon'
import { appIconCandidates } from './appIcon'
import {
  appendDiagnosticEvent,
  buildDiagnosticManifest,
  createDiagnosticArchive,
  diagnosticArchiveName
} from './diagnostics'
import {
  assertPathWithinTestRoot,
  assertTestIsolationEnvironment
} from '../runtime/test-isolation'

const GLOBAL_SHORTCUT = 'Alt+Space'

function appIconPath(): string {
  const candidates = appIconCandidates(app.getAppPath(), __dirname, process.resourcesPath)
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

assertTestIsolationEnvironment()
if (process.env.LEANCLAW_DATA_DIR) {
  app.setPath('userData', process.env.LEANCLAW_DATA_DIR)
}
assertPathWithinTestRoot(app.getPath('userData'), 'Electron userData')

const logsDir = join(app.getPath('userData'), 'logs')
const runtimeUsageCachePath = join(app.getPath('userData'), 'runtime-overview-usage.json')
const privateRoots = [app.getPath('userData'), homedir()]

type RuntimeUsage7d = RuntimeOverviewView['usage7d']

function normalizeRuntimeUsage(value: unknown): RuntimeUsage7d | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const countKeys = ['runs', 'modelCalls', 'toolCalls', 'tokensIn', 'tokensOut'] as const
  if (
    !countKeys.every(
      (key) =>
        typeof row[key] === 'number' &&
        Number.isSafeInteger(row[key]) &&
        (row[key] as number) >= 0
    ) ||
    typeof row.costUsd !== 'number' ||
    !Number.isFinite(row.costUsd) ||
    row.costUsd < 0
  ) {
    return null
  }
  return {
    runs: row.runs as number,
    modelCalls: row.modelCalls as number,
    toolCalls: row.toolCalls as number,
    tokensIn: row.tokensIn as number,
    tokensOut: row.tokensOut as number,
    costUsd: row.costUsd
  }
}

function readRuntimeUsageCache(): RuntimeUsage7d | null {
  if (!existsSync(runtimeUsageCachePath)) return null
  try {
    const parsed = JSON.parse(readFileSync(runtimeUsageCachePath, 'utf8')) as {
      usage7d?: unknown
    }
    return normalizeRuntimeUsage(parsed.usage7d)
  } catch {
    return null
  }
}

function writeRuntimeUsageCache(usage7d: RuntimeUsage7d): void {
  const tempPath = `${runtimeUsageCachePath}.tmp`
  try {
    writeFileSync(tempPath, JSON.stringify({ usage7d }), 'utf8')
    renameSync(tempPath, runtimeUsageCachePath)
  } catch {
    // Runtime health caching must never destabilize the desktop process.
  }
}

function logMain(event: string, options: { level?: 'info' | 'error'; code?: string | number; error?: unknown } = {}): void {
  try {
    appendDiagnosticEvent({
      logDir: logsDir,
      process: 'main',
      level: options.level ?? 'info',
      event,
      ...(options.code === undefined ? {} : { code: options.code }),
      ...(options.error === undefined ? {} : { error: options.error }),
      privateRoots
    })
  } catch {
    // Diagnostics must never destabilize the application.
  }
}

process.on('uncaughtExceptionMonitor', (error) => logMain('uncaught-exception', { level: 'error', error }))

let win: BrowserWindow | null = null
let quickWin: BrowserWindow | null = null
let tray: Tray | null = null
let runtime: UtilityProcess | null = null
let runtimeReady = false
let lastRuntimeOverview: RuntimeOverviewView | null = null
let lastRuntimeUsage = readRuntimeUsageCache()
let seq = 0
const pending = new Map<
  number,
  {
    resolve: (v: unknown) => void
    reject: (e: Error) => void
    timer?: ReturnType<typeof setTimeout>
  }
>()
const lastUserStatus = new Map<string, string>()

function startRuntime(): void {
  logMain('runtime-starting')
  runtimeReady = false
  const child = utilityProcess.fork(join(__dirname, 'runtime.js'), [], {
    serviceName: 'leanclaw-runtime',
    env: {
      ...(process.env as Record<string, string>),
      LEANCLAW_DATA_DIR: app.getPath('userData')
    }
  })
  runtime = child
  child.on('message', (msg: { kind: string; id?: number; result?: unknown; error?: string; event?: PushEvent }) => {
    if (msg.kind === 'rpc-result' && msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (p) {
        pending.delete(msg.id)
        if (p.timer) clearTimeout(p.timer)
        if (msg.error) p.reject(new Error(msg.error))
        else p.resolve(msg.result)
      }
    } else if (msg.kind === 'push' && msg.event) {
      win?.webContents.send('push', msg.event)
      notifyIfNeeded(msg.event)
    } else if (msg.kind === 'ready') {
      runtimeReady = true
      logMain('runtime-ready')
    }
  })
  child.on('exit', (code) => {
    runtimeReady = false
    if (runtime === child) runtime = null
    for (const request of pending.values()) {
      if (request.timer) clearTimeout(request.timer)
      request.reject(new Error('runtime 已离线'))
    }
    pending.clear()
    logMain('runtime-exit', { level: code === 0 ? 'info' : 'error', code })
    if (code !== 0) console.error('leanclaw-runtime 异常退出，code =', code)
  })
}

function notifyIfNeeded(e: PushEvent): void {
  if (e.type !== 'task') return
  const prev = lastUserStatus.get(e.task.id)
  lastUserStatus.set(e.task.id, e.task.userStatus)
  rebuildTrayMenu()
  if (prev === e.task.userStatus || !Notification.isSupported()) return
  if (e.task.userStatus === 'Waiting for You') {
    new Notification({ title: 'LeanClaw 需要你处理', body: e.task.goal.slice(0, 80) }).show()
  } else if (e.task.userStatus === 'Delivered') {
    new Notification({ title: 'LeanClaw 已交付', body: e.task.goal.slice(0, 80) }).show()
  }
}

function showOrCreateWindow(): void {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    createWindow()
  }
}

function showQuickCapture(): void {
  if (!quickWin) {
    quickWin = new BrowserWindow({
      width: 560,
      height: 210,
      show: false,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    quickWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    quickWin.webContents.on('will-navigate', (event) => event.preventDefault())
    if (process.env.ELECTRON_RENDERER_URL) {
      void quickWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}?quick=1`)
    } else {
      void quickWin.loadFile(join(__dirname, '../renderer/index.html'), { query: { quick: '1' } })
    }
    quickWin.on('closed', () => { quickWin = null })
  }
  if (quickWin.isVisible()) {
    quickWin.hide()
    return
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const [width, height] = quickWin.getSize()
  quickWin.setPosition(
    Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    Math.round(display.workArea.y + display.workArea.height * 0.18 - height / 2)
  )
  quickWin.show()
  quickWin.focus()
}

function countRunningTasks(): number {
  let n = 0
  for (const status of lastUserStatus.values()) {
    if (status === 'Running' || status === 'Verifying') n++
  }
  return n
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: '打开 LeanClaw', click: () => showOrCreateWindow() },
    { label: `运行中任务：${countRunningTasks()}`, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(buildTrayIconDataURL())
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('LeanClaw')
  tray.on('click', () => showOrCreateWindow())
  rebuildTrayMenu()
}

function pushConfig(patch: {
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
}): void {
  runtime?.postMessage({ kind: 'config', ...patch })
}

function pushProviders(): void {
  pushConfig({
    providers: readProvidersForRuntime(),
    defaultProviderId: readDefaultProviderId()
  })
}

function pushMcp(): void {
  pushConfig({
    mcpServers: readMcpServersForRuntime(),
    mcpToolRisk: readMcpToolRisk()
  })
}

function pushInitialConfig(): void {
  const key = readDecryptedKey()
  const base = {
    model: readModel(),
    maxActiveTasks: readMaxActiveTasks(),
    defaultBudgetUsd: readDefaultBudgetUsd(),
    snapshotQuotaMb: readSnapshotQuotaMb(),
    providers: readProvidersForRuntime(),
    defaultProviderId: readDefaultProviderId(),
    tierMap: readTierMap(),
    mcpServers: readMcpServersForRuntime(),
    mcpToolRisk: readMcpToolRisk(),
    shellEnabled: readShellEnabled(),
    shellAllowPrefixes: readShellAllowPrefixes()
  }
  pushConfig(key ? { apiKey: key, ...base } : base)
}

function offlineRuntimeOverview(): RuntimeOverviewView {
  const offline = createOfflineRuntimeOverview(lastRuntimeOverview)
  if (!lastRuntimeOverview && lastRuntimeUsage) {
    offline.usage7d = { ...lastRuntimeUsage }
  }
  const settings = getSettings()
  const cachedProviders = new Map(
    (lastRuntimeOverview?.providers ?? []).map((provider) => [provider.id, provider])
  )
  const providers: RuntimeOverviewView['providers'] = getProvidersView().providers.map((provider) => {
    const cached = cachedProviders.get(provider.id)
    return {
      id: provider.id,
      name: provider.name,
      configured: provider.hasKey,
      defaultModel: provider.defaultModel,
      lastTestStatus: cached?.lastTestStatus ?? 'unknown',
      lastTestedAt: cached?.lastTestedAt ?? null,
      errorSummary: cached?.errorSummary ?? null
    }
  })
  if (settings.hasApiKey && !providers.some((provider) => provider.id === LEGACY_PROVIDER_ID)) {
    const cached = cachedProviders.get(LEGACY_PROVIDER_ID)
    providers.unshift({
      id: LEGACY_PROVIDER_ID,
      name: 'Anthropic',
      configured: true,
      defaultModel: settings.model,
      lastTestStatus: cached?.lastTestStatus ?? 'unknown',
      lastTestedAt: cached?.lastTestedAt ?? null,
      errorSummary: cached?.errorSummary ?? null
    })
  }
  const cachedMcp = new Map(
    (lastRuntimeOverview?.mcp ?? []).map((server) => [server.id, server])
  )

  return {
    ...offline,
    runtime: {
      ...offline.runtime,
      maxActiveTasks: settings.maxActiveTasks
    },
    providers,
    mcp: listMcpServers().map((server) => ({
      id: server.id,
      name: server.name,
      state: server.enabled ? 'error' : 'disabled',
      toolCount: cachedMcp.get(server.id)?.toolCount ?? 0,
      errorSummary: server.enabled ? 'Runtime 离线' : null
    })),
    shell: {
      enabled: settings.shellEnabled,
      allowPrefixCount: settings.shellAllowPrefixes.length,
      risk: settings.shellEnabled ? 'approval_required' : 'forbidden'
    }
  }
}

function rpc(req: RpcRequest): Promise<unknown> {
  if (req.method === 'getRuntimeOverview' && (!runtime || !runtimeReady)) {
    return Promise.resolve(offlineRuntimeOverview())
  }
  const call = new Promise<unknown>((resolve, reject) => {
    const target = runtime
    if (!target) return reject(new Error('runtime 未启动'))
    const id = ++seq
    const request: {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer?: ReturnType<typeof setTimeout>
    } = { resolve, reject }
    if (req.method === 'getRuntimeOverview') {
      request.timer = setTimeout(() => {
        if (!pending.delete(id)) return
        reject(new Error('runtime overview 超时'))
      }, 3000)
    }
    pending.set(id, request)
    try {
      target.postMessage({ id, req })
    } catch (error) {
      pending.delete(id)
      if (request.timer) clearTimeout(request.timer)
      reject(error as Error)
    }
  })
  if (req.method !== 'getRuntimeOverview') return call
  return call
    .then((result) => {
      lastRuntimeOverview = result as RuntimeOverviewView
      lastRuntimeUsage = { ...lastRuntimeOverview.usage7d }
      writeRuntimeUsageCache(lastRuntimeUsage)
      return result
    })
    .catch(() => offlineRuntimeOverview())
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'LeanClaw',
    icon: appIconPath(),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('render-process-gone', (_event, details) => {
    logMain('renderer-process-gone', { level: 'error', code: `${details.reason}:${details.exitCode}` })
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  win.on('closed', () => {
    win = null
  })
}

void app.whenReady().then(() => {
  logMain('app-ready')
  if (process.platform === 'darwin' && app.dock && existsSync(appIconPath())) app.dock.setIcon(appIconPath())
  startRuntime()
  pushInitialConfig()
  ipcMain.handle('rpc', (_event, req: RpcRequest) => rpc(req))
  ipcMain.handle('quick-capture-close', (event) => {
    if (event.sender !== quickWin?.webContents) throw new Error('无效的快速输入请求')
    quickWin.hide()
  })
  ipcMain.handle('quick-capture-open', (event) => {
    if (event.sender !== win?.webContents) throw new Error('无效的快速输入请求')
    showQuickCapture()
  })
  ipcMain.handle('reveal', (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle('open-external', (_event, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new Error('仅允许打开 http/https 链接')
    }
    return shell.openExternal(url)
  })
  ipcMain.handle('copy-deliverable', async (event, artifactId: string) => {
    if (event.sender !== win?.webContents || typeof artifactId !== 'string') throw new Error('无效的复制请求')
    const detail = await rpc({ method: 'getDeliverable', artifactId }) as { content: string }
    clipboard.writeText(detail.content)
  })
  ipcMain.handle('save-deliverable', async (event, artifactId: string, title: string) => {
    if (event.sender !== win?.webContents || typeof artifactId !== 'string') throw new Error('无效的导出请求')
    const detail = await rpc({ method: 'getDeliverable', artifactId }) as { content: string }
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedExportName(String(title), 'md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return { cancelled: true }
    assertPathWithinTestRoot(result.filePath, 'Markdown 导出路径')
    await writeFile(result.filePath, detail.content, 'utf8')
    return { cancelled: false }
  })
  ipcMain.handle('export-deliverable-pdf', async (event, title: string) => {
    if (event.sender !== win?.webContents) throw new Error('无效的 PDF 导出请求')
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedExportName(String(title), 'pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return { cancelled: true }
    assertPathWithinTestRoot(result.filePath, 'PDF 导出路径')
    const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(result.filePath, pdf)
    return { cancelled: false }
  })
  ipcMain.handle('export-diagnostics', async (event) => {
    if (event.sender !== win?.webContents) throw new Error('无效的诊断包导出请求')
    const testDestination = process.env.LEANCLAW_DATA_DIR
      ? process.env.LEANCLAW_DIAGNOSTICS_EXPORT_PATH
      : undefined
    const result = testDestination ? { canceled: false, filePath: testDestination } : await dialog.showSaveDialog(win, {
      defaultPath: diagnosticArchiveName(),
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return { cancelled: true }
    assertPathWithinTestRoot(result.filePath, '诊断导出路径')
    logMain('diagnostics-exported')
    await createDiagnosticArchive({
      logsDir,
      destination: result.filePath,
      manifest: buildDiagnosticManifest({
        createdAt: new Date().toISOString(),
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        packaged: app.isPackaged,
        versions: {
          electron: process.versions.electron ?? '',
          node: process.versions.node,
          chrome: process.versions.chrome ?? ''
        }
      })
    })
    return { cancelled: false, fileName: basename(result.filePath) }
  })
  ipcMain.handle('settings-get', () => getSettings())
  ipcMain.handle('settings-set-key', (_event, key: string) => {
    const settings = setKey(key)
    pushConfig({ apiKey: readDecryptedKey(), model: readModel() })
    return settings
  })
  ipcMain.handle('settings-clear-key', () => {
    const settings = clearKey()
    pushConfig({ apiKey: null, model: readModel() })
    return settings
  })
  ipcMain.handle('settings-set-model', (_event, model: string) => {
    const settings = setModel(model)
    pushConfig({ model: readModel() })
    return settings
  })
  ipcMain.handle('settings-set-max-active', (_event, value: number) => {
    const settings = setMaxActiveTasks(value)
    pushConfig({ maxActiveTasks: readMaxActiveTasks() })
    return settings
  })
  ipcMain.handle('settings-set-default-budget', (_event, value: number) => {
    const settings = setDefaultBudget(value)
    pushConfig({ defaultBudgetUsd: readDefaultBudgetUsd() })
    return settings
  })
  ipcMain.handle('settings-set-snapshot-quota', (_event, value: number) => {
    const settings = setSnapshotQuotaMb(value)
    pushConfig({ snapshotQuotaMb: readSnapshotQuotaMb() })
    return settings
  })
  ipcMain.handle('settings-set-shell-enabled', (_event, value: boolean) => {
    const settings = setShellEnabled(value)
    pushConfig({ shellEnabled: readShellEnabled() })
    return settings
  })
  ipcMain.handle('settings-set-shell-allow-prefixes', (_event, value: string[]) => {
    const settings = setShellAllowPrefixes(value)
    pushConfig({ shellAllowPrefixes: readShellAllowPrefixes() })
    return settings
  })
  ipcMain.handle('providers-get', () => getProvidersView())
  ipcMain.handle('providers-upsert', (_event, input: ProviderUpsertInput) => {
    const view = upsertProvider(input)
    pushProviders()
    return view
  })
  ipcMain.handle('providers-delete', (_event, providerId: string) => {
    const view = deleteProvider(providerId)
    pushProviders()
    return view
  })
  ipcMain.handle('providers-set-key', (_event, providerId: string, key: string) => {
    const view = setProviderKey(providerId, key)
    pushProviders()
    return view
  })
  ipcMain.handle('providers-clear-key', (_event, providerId: string) => {
    const view = clearProviderKey(providerId)
    pushProviders()
    return view
  })
  ipcMain.handle('providers-set-default', (_event, providerId: string | null) => {
    const view = setDefaultProvider(providerId)
    pushProviders()
    return view
  })
  ipcMain.handle('tiermap-get', () => readTierMap())
  ipcMain.handle('tiermap-set', (_event, input: SetTierRouteInput) => {
    const view = setTierRoute(input.tier, input.providerId, input.model, input.fallback ?? null)
    pushConfig({ tierMap: view })
    return view
  })
  ipcMain.handle('tiermap-clear', (_event, tier: ModelTier) => {
    const view = clearTierRoute(tier)
    pushConfig({ tierMap: view })
    return view
  })
  ipcMain.handle('mcp-list', () => listMcpServers())
  ipcMain.handle('mcp-upsert', (_event, input: McpServerUpsertInput) => {
    const view = upsertMcpServer(input)
    pushMcp()
    return view
  })
  ipcMain.handle('mcp-delete', (_event, serverId: string) => {
    const view = deleteMcpServer(serverId)
    pushMcp()
    return view
  })
  ipcMain.handle('mcp-set-tool-risk', (_event, input: SetMcpToolRiskInput) => {
    setMcpToolRisk(input.toolId, input.risk)
    pushMcp()
    return listMcpServers()
  })
  createWindow()
  createTray()
  globalShortcut.register(GLOBAL_SHORTCUT, () => showQuickCapture())
  app.on('activate', () => {
    if (!win) createWindow()
    else showOrCreateWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  logMain('app-stopping')
  quickWin?.destroy()
  runtime?.kill()
})
