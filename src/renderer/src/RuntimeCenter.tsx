import { useState } from 'react'
import type { RuntimeOverviewView } from '../../shared/types'
import type { SettingsSection } from './Settings'

type Overall = RuntimeOverviewView['overall']
type ProviderTestState = 'idle' | 'testing' | 'passed' | 'failed'

interface RuntimeCenterProps {
  overview: RuntimeOverviewView | null
  loading: boolean
  error: string
  onRefresh: () => Promise<void>
  onOpenSettings: (section: SettingsSection) => void
}

const OVERALL_COPY: Record<
  Overall,
  { label: string; title: string; detail: string }
> = {
  ready: {
    label: '就绪',
    title: '本机执行环境已就绪',
    detail: '关键配置与连接状态正常，可以继续发起任务。'
  },
  busy: {
    label: '执行中',
    title: '本机执行环境正在工作',
    detail: '当前有任务执行或排队，新的任务会遵守 WIP 上限。'
  },
  degraded: {
    label: '部分异常',
    title: '有配置或连接需要处理',
    detail: '历史统计仍可查看；请按下方卡片提示完成配置或修复连接。'
  },
  offline: {
    label: '离线',
    title: 'Runtime 当前不可达',
    detail: '当前执行操作已停用；历史统计和本机安全配置仍可查看。'
  }
}

const MCP_STATE_COPY: Record<
  RuntimeOverviewView['mcp'][number]['state'],
  { label: string; tone: 'ready' | 'busy' | 'degraded' | 'offline' }
> = {
  connected: { label: '已连接', tone: 'ready' },
  connecting: { label: '连接中', tone: 'busy' },
  error: { label: '连接错误', tone: 'degraded' },
  disabled: { label: '已停用', tone: 'offline' }
}

export function runtimeOverallLabel(overall: Overall): string {
  return OVERALL_COPY[overall].label
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function providerStatusLabel(
  provider: RuntimeOverviewView['providers'][number],
  testState: ProviderTestState
): string {
  if (testState === 'passed') return '连接成功'
  if (testState === 'failed') return '连接失败，请前往设置检查配置。'
  if (testState === 'testing') return '正在测试连接…'
  if (provider.lastTestStatus === 'passed') return '最近测试通过'
  if (provider.lastTestStatus === 'failed') return '最近测试失败'
  return '尚未测试'
}

export function RuntimeCenter({
  overview,
  loading,
  error,
  onRefresh,
  onOpenSettings
}: RuntimeCenterProps): React.JSX.Element {
  const [providerTests, setProviderTests] = useState<Record<string, ProviderTestState>>({})
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const [diagnosticsStatus, setDiagnosticsStatus] = useState('')

  const runProviderTest = async (providerId: string): Promise<void> => {
    if (providerTests[providerId] === 'testing' || overview?.overall === 'offline') return
    setProviderTests((current) => ({ ...current, [providerId]: 'testing' }))
    try {
      const result = await window.api.testProvider(providerId)
      setProviderTests((current) => ({
        ...current,
        [providerId]: result.ok ? 'passed' : 'failed'
      }))
    } catch {
      setProviderTests((current) => ({ ...current, [providerId]: 'failed' }))
    }
  }

  const exportDiagnostics = async (): Promise<void> => {
    if (diagnosticsBusy) return
    setDiagnosticsBusy(true)
    setDiagnosticsStatus('')
    try {
      const result = await window.api.exportDiagnostics()
      setDiagnosticsStatus(result.cancelled ? '' : `已导出 ${result.fileName ?? '诊断包'}`)
    } catch {
      setDiagnosticsStatus('导出失败，请稍后重试。')
    } finally {
      setDiagnosticsBusy(false)
    }
  }

  if (!overview) {
    return (
      <main className="home runtime-center" aria-busy={loading}>
        <div className="runtime-page-head">
          <div>
            <h1>本机运行环境</h1>
            <p className="sub">检查执行容量、模型连接、工具接入与本机安全边界。</p>
          </div>
          <button disabled={loading} onClick={() => void onRefresh()} aria-label="刷新运行时状态">
            {loading ? '检查中…' : '重新检查'}
          </button>
        </div>
        <div className="runtime-loading-card" role="status">
          <span className="runtime-status-mark busy" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <strong>{error ? '暂时无法读取运行时状态' : '正在检查本机 Runtime…'}</strong>
            <p>{error || '页面会在检查完成后自动更新。'}</p>
          </div>
        </div>
      </main>
    )
  }

  const copy = OVERALL_COPY[overview.overall]
  const metrics = [
    { label: '活跃任务', value: formatCount(overview.runtime.activeTasks) },
    { label: '排队任务', value: formatCount(overview.runtime.queuedTasks) },
    { label: 'WIP 上限', value: formatCount(overview.runtime.maxActiveTasks) },
    { label: '7 日 Run', value: formatCount(overview.usage7d.runs) },
    { label: '模型调用', value: formatCount(overview.usage7d.modelCalls) },
    { label: '工具调用', value: formatCount(overview.usage7d.toolCalls) }
  ]

  return (
    <main className="home runtime-center" aria-busy={loading}>
      <div className="runtime-page-head">
        <div>
          <h1>本机运行环境</h1>
          <p className="sub">检查执行容量、模型连接、工具接入与本机安全边界。</p>
        </div>
        <button
          className="runtime-refresh"
          disabled={loading}
          onClick={() => void onRefresh()}
          aria-label="刷新运行时状态"
        >
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error && (
        <div className="runtime-inline-alert" role="alert">
          <span>{error}</span>
          <button onClick={() => void onRefresh()}>重试</button>
        </div>
      )}

      <section className={`runtime-health-hero ${overview.overall}`} aria-label={`总体状态：${copy.label}`}>
        <span className={`runtime-status-mark ${overview.overall}`} aria-hidden="true">
          <i /><i /><i />
        </span>
        <div className="runtime-health-copy">
          <span className={`runtime-state-label ${overview.overall}`}>{copy.label}</span>
          <h2>{copy.title}</h2>
          <p>{copy.detail}</p>
        </div>
        <div className="runtime-health-meta">
          <span>当前执行</span>
          <strong>
            {overview.runtime.activeTasks > 0
              ? `${overview.runtime.activeTasks} 个任务执行中`
              : '无活跃任务'}
          </strong>
          <small>
            {overview.runtime.queuedTasks > 0
              ? `${overview.runtime.queuedTasks} 个任务排队`
              : '队列为空'}
          </small>
        </div>
      </section>

      <section aria-labelledby="runtime-overview-heading">
        <div className="runtime-section-head">
          <div>
            <h2 id="runtime-overview-heading">总览</h2>
            <p>当前执行容量与最近 7 日本机使用量。</p>
          </div>
          <span className="runtime-section-kicker">最近 7 日</span>
        </div>
        <div className="runtime-metric-grid">
          {metrics.map((metric) => (
            <div className="runtime-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
        <div className="runtime-usage-foot">
          <span>Token 输入 {formatCount(overview.usage7d.tokensIn)}</span>
          <span>Token 输出 {formatCount(overview.usage7d.tokensOut)}</span>
          <span>估算成本 <strong>${overview.usage7d.costUsd.toFixed(4)}</strong></span>
        </div>
      </section>

      <section aria-labelledby="runtime-provider-heading">
        <div className="runtime-section-head">
          <div>
            <h2 id="runtime-provider-heading">Provider</h2>
            <p>模型服务配置与按需连接测试。</p>
          </div>
        </div>
        {overview.providers.length === 0 ? (
          <div className="runtime-empty-card">
            <div>
              <strong>尚未配置 Provider</strong>
              <p>添加模型服务商和密钥后，LeanClaw 才能使用远程模型。</p>
            </div>
            <button className="primary" onClick={() => onOpenSettings('providers')}>
              前往 Provider 设置
            </button>
          </div>
        ) : (
          <div className="runtime-resource-list">
            {overview.providers.map((provider) => {
              const testState = providerTests[provider.id] ?? 'idle'
              const testStatus = providerStatusLabel(provider, testState)
              return (
                <article className="runtime-resource-card" aria-label={provider.name} key={provider.id}>
                  <div className="runtime-resource-main">
                    <div className="runtime-resource-title">
                      <strong title={provider.name}>{provider.name}</strong>
                      <span className={`runtime-state-label ${provider.configured ? 'ready' : 'degraded'}`}>
                        {provider.configured ? '已配置' : '未配置'}
                      </span>
                    </div>
                    <p title={provider.defaultModel}>默认模型 · {provider.defaultModel}</p>
                    <span
                      role="status"
                      className={`runtime-test-result ${testState === 'failed' ? 'failed' : ''}`}
                    >
                      {testStatus}
                    </span>
                  </div>
                  <div className="runtime-resource-actions">
                    {provider.configured ? (
                      <button
                        disabled={testState === 'testing' || overview.overall === 'offline'}
                        onClick={() => void runProviderTest(provider.id)}
                      >
                        {testState === 'testing' ? '测试中…' : '测试连接'}
                      </button>
                    ) : null}
                    <button onClick={() => onOpenSettings('providers')}>
                      前往设置
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="runtime-mcp-heading">
        <div className="runtime-section-head">
          <div>
            <h2 id="runtime-mcp-heading">MCP</h2>
            <p>只展示连接状态和工具数量，不在这里暴露命令或环境变量。</p>
          </div>
          <button className="ghost small" onClick={() => onOpenSettings('mcp')}>前往设置</button>
        </div>
        {overview.mcp.length === 0 ? (
          <div className="runtime-empty-card compact">
            <div>
              <strong>未配置 MCP Server</strong>
              <p>这是可选能力，不影响基础任务执行。</p>
            </div>
          </div>
        ) : (
          <div className="runtime-resource-list">
            {overview.mcp.map((server) => {
              const state = MCP_STATE_COPY[server.state]
              return (
                <article className="runtime-resource-card" aria-label={server.name} key={server.id}>
                  <div className="runtime-resource-main">
                    <div className="runtime-resource-title">
                      <strong title={server.name}>{server.name}</strong>
                      <span className={`runtime-state-label ${state.tone}`}>{state.label}</span>
                    </div>
                    <p>{formatCount(server.toolCount)} 个工具</p>
                    {server.errorSummary && <span className="runtime-safe-error">连接失败，请前往设置检查配置。</span>}
                  </div>
                  <div className="runtime-resource-actions">
                    <button onClick={() => onOpenSettings('mcp')}>前往设置</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="runtime-shell-heading">
        <div className="runtime-section-head">
          <div>
            <h2 id="runtime-shell-heading">Shell</h2>
            <p>本机命令执行保持显式授权和最小白名单。</p>
          </div>
        </div>
        <article className="runtime-resource-card runtime-shell-card" aria-label="Shell 安全状态">
          <div className="runtime-resource-main">
            <div className="runtime-resource-title">
              <strong>{overview.shell.enabled ? '需逐次批准' : '安全默认'}</strong>
              <span className={`runtime-state-label ${overview.shell.enabled ? 'busy' : 'ready'}`}>
                {overview.shell.enabled ? '已开启' : '已关闭'}
              </span>
            </div>
            <p>
              {overview.shell.enabled
                ? `${overview.shell.allowPrefixCount} 条白名单 · 未命中命令必须批准`
                : 'Shell 默认关闭，不会执行本机命令。'}
            </p>
          </div>
          <div className="runtime-resource-actions">
            <button onClick={() => onOpenSettings('shell')}>前往设置</button>
          </div>
        </article>
      </section>

      <section aria-labelledby="runtime-diagnostics-heading">
        <div className="runtime-section-head">
          <div>
            <h2 id="runtime-diagnostics-heading">诊断</h2>
            <p>导出系统清单和轮转日志；页面不会直接展示日志正文。</p>
          </div>
        </div>
        <div className="runtime-diagnostics-card">
          <div>
            <strong>隐私安全诊断包</strong>
            <p>不包含任务正文、数据库、API Key 或 MCP 密钥。</p>
          </div>
          <div className="runtime-diagnostics-action">
            <button disabled={diagnosticsBusy} onClick={() => void exportDiagnostics()}>
              {diagnosticsBusy ? '导出中…' : '导出诊断包'}
            </button>
            {diagnosticsStatus && <span role="status">{diagnosticsStatus}</span>}
          </div>
        </div>
      </section>
    </main>
  )
}
