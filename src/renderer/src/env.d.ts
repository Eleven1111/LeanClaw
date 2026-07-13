/// <reference types="vite/client" />
import type {
  McpServerStatus,
  McpServerUpsertInput,
  McpServerView,
  ModelTier,
  ProvidersView,
  ProviderUpsertInput,
  PushEvent,
  RpcRequest,
  SetMcpToolRiskInput,
  SetTierRouteInput,
  SettingsView,
  TestProviderResult,
  TierMapView
} from '../../shared/types'

declare global {
  interface Window {
    api: {
      rpc(req: RpcRequest): Promise<unknown>
      reveal(path: string): Promise<void>
      openExternal(url: string): Promise<void>
      copyDeliverable(artifactId: string): Promise<void>
      saveDeliverable(artifactId: string, title: string): Promise<{ cancelled: boolean }>
      exportDeliverablePdf(title: string): Promise<{ cancelled: boolean }>
      closeQuickCapture(): Promise<void>
      openQuickCapture(): Promise<void>
      getPathForFile(file: File): string
      onPush(cb: (e: PushEvent) => void): () => void
      getSettings(): Promise<SettingsView>
      setApiKey(key: string): Promise<SettingsView>
      clearApiKey(): Promise<SettingsView>
      setModel(model: string): Promise<SettingsView>
      setMaxActiveTasks(value: number): Promise<SettingsView>
      setDefaultBudget(value: number): Promise<SettingsView>
      setSnapshotQuota(value: number): Promise<SettingsView>
      setShellEnabled(value: boolean): Promise<SettingsView>
      setShellAllowPrefixes(value: string[]): Promise<SettingsView>
      getProviders(): Promise<ProvidersView>
      upsertProvider(input: ProviderUpsertInput): Promise<ProvidersView>
      deleteProvider(providerId: string): Promise<ProvidersView>
      setProviderKey(providerId: string, key: string): Promise<ProvidersView>
      clearProviderKey(providerId: string): Promise<ProvidersView>
      setDefaultProvider(providerId: string | null): Promise<ProvidersView>
      testProvider(providerId: string): Promise<TestProviderResult>
      getTierMap(): Promise<TierMapView>
      setTierRoute(input: SetTierRouteInput): Promise<TierMapView>
      clearTierRoute(tier: ModelTier): Promise<TierMapView>
      listMcpServers(): Promise<McpServerView[]>
      upsertMcpServer(input: McpServerUpsertInput): Promise<McpServerView[]>
      deleteMcpServer(serverId: string): Promise<McpServerView[]>
      setMcpToolRisk(input: SetMcpToolRiskInput): Promise<McpServerView[]>
      mcpStatus(): Promise<McpServerStatus[]>
    }
  }
}

export {}
