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
  shell,
  Tray,
  utilityProcess
} from 'electron'
import type { UtilityProcess } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { suggestedExportName } from '../shared/markdown'
import type {
  McpServerUpsertInput,
  ModelTier,
  ProviderUpsertInput,
  PushEvent,
  RpcRequest,
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
  setTierRoute,
  upsertMcpServer,
  upsertProvider
} from './settings'
import { buildTrayIconDataURL } from './trayIcon'

const GLOBAL_SHORTCUT = 'Alt+Space'

if (process.env.LEANCLAW_DATA_DIR) {
  app.setPath('userData', process.env.LEANCLAW_DATA_DIR)
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
let runtime: UtilityProcess | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const lastUserStatus = new Map<string, string>()

function startRuntime(): void {
  runtime = utilityProcess.fork(join(__dirname, 'runtime.js'), [], {
    serviceName: 'leanclaw-runtime',
    env: {
      ...(process.env as Record<string, string>),
      LEANCLAW_DATA_DIR: app.getPath('userData')
    }
  })
  runtime.on('message', (msg: { kind: string; id?: number; result?: unknown; error?: string; event?: PushEvent }) => {
    if (msg.kind === 'rpc-result' && msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (p) {
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error))
        else p.resolve(msg.result)
      }
    } else if (msg.kind === 'push' && msg.event) {
      win?.webContents.send('push', msg.event)
      notifyIfNeeded(msg.event)
    }
  })
  runtime.on('exit', (code) => {
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

function rpc(req: RpcRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!runtime) {
      reject(new Error('runtime 未启动'))
      return
    }
    const id = ++seq
    pending.set(id, { resolve, reject })
    runtime.postMessage({ id, req })
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'LeanClaw',
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
  startRuntime()
  pushInitialConfig()
  ipcMain.handle('rpc', (_event, req: RpcRequest) => rpc(req))
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
    const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(result.filePath, pdf)
    return { cancelled: false }
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
  globalShortcut.register(GLOBAL_SHORTCUT, () => showOrCreateWindow())
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  runtime?.kill()
})
