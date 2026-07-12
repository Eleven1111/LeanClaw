import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  rpc: (req: unknown) => ipcRenderer.invoke('rpc', req),
  reveal: (path: string) => ipcRenderer.invoke('reveal', path),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  copyDeliverable: (artifactId: string) => ipcRenderer.invoke('copy-deliverable', artifactId),
  saveDeliverable: (artifactId: string, title: string) => ipcRenderer.invoke('save-deliverable', artifactId, title),
  exportDeliverablePdf: (title: string) => ipcRenderer.invoke('export-deliverable-pdf', title),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getSettings: () => ipcRenderer.invoke('settings-get'),
  setApiKey: (key: string) => ipcRenderer.invoke('settings-set-key', key),
  clearApiKey: () => ipcRenderer.invoke('settings-clear-key'),
  setModel: (model: string) => ipcRenderer.invoke('settings-set-model', model),
  setMaxActiveTasks: (value: number) => ipcRenderer.invoke('settings-set-max-active', value),
  setDefaultBudget: (value: number) => ipcRenderer.invoke('settings-set-default-budget', value),
  setShellEnabled: (value: boolean) => ipcRenderer.invoke('settings-set-shell-enabled', value),
  setShellAllowPrefixes: (value: string[]) =>
    ipcRenderer.invoke('settings-set-shell-allow-prefixes', value),
  getProviders: () => ipcRenderer.invoke('providers-get'),
  upsertProvider: (input: unknown) => ipcRenderer.invoke('providers-upsert', input),
  deleteProvider: (providerId: string) => ipcRenderer.invoke('providers-delete', providerId),
  setProviderKey: (providerId: string, key: string) =>
    ipcRenderer.invoke('providers-set-key', providerId, key),
  clearProviderKey: (providerId: string) => ipcRenderer.invoke('providers-clear-key', providerId),
  setDefaultProvider: (providerId: string | null) =>
    ipcRenderer.invoke('providers-set-default', providerId),
  testProvider: (providerId: string) => ipcRenderer.invoke('rpc', { method: 'testProvider', providerId }),
  getTierMap: () => ipcRenderer.invoke('tiermap-get'),
  setTierRoute: (input: unknown) => ipcRenderer.invoke('tiermap-set', input),
  clearTierRoute: (tier: string) => ipcRenderer.invoke('tiermap-clear', tier),
  listMcpServers: () => ipcRenderer.invoke('mcp-list'),
  upsertMcpServer: (input: unknown) => ipcRenderer.invoke('mcp-upsert', input),
  deleteMcpServer: (serverId: string) => ipcRenderer.invoke('mcp-delete', serverId),
  setMcpToolRisk: (input: unknown) => ipcRenderer.invoke('mcp-set-tool-risk', input),
  mcpStatus: () => ipcRenderer.invoke('rpc', { method: 'mcpStatus' }),
  onPush: (cb: (e: unknown) => void) => {
    const listener = (_event: unknown, e: unknown): void => cb(e)
    ipcRenderer.on('push', listener)
    return () => ipcRenderer.removeListener('push', listener)
  }
})
