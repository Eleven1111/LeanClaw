import { useEffect, useRef, useState } from 'react'
import type {
  McpServerState,
  McpServerStatus,
  McpServerUpsertInput,
  McpServerView,
  RiskLevel
} from '../../shared/types'

const DELETE_CONFIRM_MS = 3000

const RISK_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: 'low', label: '无需批准（low）' },
  { value: 'approval_required', label: '每次批准（默认）' },
  { value: 'forbidden', label: '禁止（forbidden）' }
]

const STATE_META: Record<McpServerState, { label: string; chip: string }> = {
  connected: { label: '已连接', chip: 'chip-green' },
  connecting: { label: '连接中', chip: 'chip-orange' },
  error: { label: '错误', chip: 'chip-red' },
  disabled: { label: '未启用', chip: 'chip-gray' }
}

interface FormState {
  id: string | null
  name: string
  command: string
  args: string
  enabled: boolean
  envText: string
  envKeys: string[]
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  command: '',
  args: '',
  enabled: true,
  envText: '',
  envKeys: []
}

function parseArgs(raw: string): string[] {
  return raw.split(/\s+/).filter((a) => a.length > 0)
}

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1)
  }
  return env
}

export function McpSettings({
  encryptionAvailable
}: {
  encryptionAvailable: boolean
}): React.JSX.Element {
  const [servers, setServers] = useState<McpServerView[]>([])
  const [status, setStatus] = useState<McpServerStatus[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshStatus = (): void => {
    void window.api.mcpStatus().then(setStatus)
  }

  useEffect(() => {
    void window.api.listMcpServers().then(setServers)
    refreshStatus()
  }, [])

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const openAddForm = (): void => {
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (s: McpServerView): void => {
    setForm({
      id: s.id,
      name: s.name,
      command: s.command,
      args: s.args.join(' '),
      enabled: s.enabled,
      envText: '',
      envKeys: s.envKeys
    })
    setFormError('')
    setShowForm(true)
  }

  const saveForm = async (): Promise<void> => {
    setFormBusy(true)
    setFormError('')
    try {
      const envProvided = form.envText.trim().length > 0
      const input: McpServerUpsertInput = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name,
        command: form.command,
        args: parseArgs(form.args),
        enabled: form.enabled,
        ...(envProvided ? { env: parseEnv(form.envText) } : {})
      }
      const view = await window.api.upsertMcpServer(input)
      setServers(view)
      setShowForm(false)
      setForm(EMPTY_FORM)
      refreshStatus()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setFormBusy(false)
    }
  }

  const toggleEnabled = async (s: McpServerView): Promise<void> => {
    try {
      const view = await window.api.upsertMcpServer({
        id: s.id,
        name: s.name,
        command: s.command,
        args: s.args,
        enabled: !s.enabled
      })
      setServers(view)
      refreshStatus()
    } catch {
      // ignore; status refresh will reflect reality
    }
  }

  const clearConfirmTimer = (): void => {
    if (confirmTimer.current) {
      clearTimeout(confirmTimer.current)
      confirmTimer.current = null
    }
  }

  const handleDelete = (id: string): void => {
    if (confirmDeleteId === id) {
      clearConfirmTimer()
      setConfirmDeleteId(null)
      void window.api.deleteMcpServer(id).then((view) => {
        setServers(view)
        refreshStatus()
      })
      return
    }
    clearConfirmTimer()
    setConfirmDeleteId(id)
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), DELETE_CONFIRM_MS)
  }

  const changeRisk = async (toolId: string, risk: RiskLevel): Promise<void> => {
    try {
      await window.api.setMcpToolRisk({ toolId, risk })
      refreshStatus()
    } catch {
      // ignore
    }
  }

  const statusOf = (id: string): McpServerStatus | undefined => status.find((s) => s.id === id)

  return (
    <section>
      <h2>MCP 工具接入</h2>
      <p className="sub">
        MCP 工具默认每次执行都需要你批准；确认可信后可将单个工具降为无需批准。密钥/环境变量经加密存储，明文不落盘、不回显。
      </p>
      <div className="input-row">
        <button className="ghost small" onClick={refreshStatus}>
          刷新状态
        </button>
      </div>

      {servers.length > 0 && (
        <div className="card-grid">
          {servers.map((s) => {
            const st = statusOf(s.id)
            const meta = STATE_META[st?.state ?? (s.enabled ? 'connecting' : 'disabled')]
            const open = expanded[s.id]
            return (
              <div key={s.id} className="card provider-card">
                <div className="input-row">
                  <h3>{s.name}</h3>
                  <span className={`chip ${meta.chip}`}>{meta.label}</span>
                </div>
                <p className="muted provider-baseurl">
                  {s.command} {s.args.join(' ')}
                </p>
                <p className="meta">
                  环境变量：{s.envKeys.length > 0 ? s.envKeys.join(', ') : '无'}
                </p>
                {st?.error && <p className="error">{st.error}</p>}
                <div className="actions">
                  <button onClick={() => void toggleEnabled(s)}>
                    {s.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
                  >
                    {open ? '收起工具' : `工具（${st?.tools.length ?? 0}）`}
                  </button>
                  <button className="ghost small" onClick={() => openEditForm(s)}>
                    编辑
                  </button>
                  <button
                    className={confirmDeleteId === s.id ? 'danger-confirm' : ''}
                    onClick={() => handleDelete(s.id)}
                  >
                    {confirmDeleteId === s.id ? '确认删除' : '删除'}
                  </button>
                </div>
                {open && st && (
                  <div className="mcp-tools">
                    {st.tools.length === 0 && <p className="muted">尚未发现工具（未连接或无工具）。</p>}
                    {st.tools.map((t) => (
                      <div key={t.toolId} className="mcp-tool-row">
                        <div className="mcp-tool-info">
                          <span className="meta">{t.name}</span>
                          <span className="muted">{t.description.slice(0, 80)}</span>
                        </div>
                        <select
                          value={t.risk}
                          onChange={(e) => void changeRisk(t.toolId, e.target.value as RiskLevel)}
                        >
                          {RISK_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm ? (
        <div className="input-card">
          <h3>{form.id ? '编辑 MCP Server' : '添加 MCP Server'}</h3>
          <input
            value={form.name}
            maxLength={40}
            placeholder="名称（如 文件系统）"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            value={form.command}
            placeholder="启动命令（如 npx 或绝对路径）"
            onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
          />
          <input
            value={form.args}
            placeholder="参数（空格分隔）"
            onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
          />
          <textarea
            value={form.envText}
            rows={3}
            placeholder={
              form.id && form.envKeys.length > 0
                ? `环境变量（已保存：${form.envKeys.join(', ')}；留空 = 不修改，填写 = 整体替换）\nKEY=VALUE`
                : '环境变量（每行 KEY=VALUE，可选）'
            }
            onChange={(e) => setForm((f) => ({ ...f, envText: e.target.value }))}
          />
          <label className="input-row meta">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            启用（保存后自动连接）
          </label>
          {!encryptionAvailable && (
            <div className="error">系统加密不可用，当前设备无法安全保存环境变量。</div>
          )}
          {formError && <div className="error">{formError}</div>}
          <div className="input-row">
            <button className="primary" disabled={formBusy} onClick={() => void saveForm()}>
              {formBusy ? '保存中…' : '保存'}
            </button>
            <button
              className="ghost"
              onClick={() => {
                setShowForm(false)
                setForm(EMPTY_FORM)
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button className="primary" onClick={openAddForm}>
          添加 MCP Server
        </button>
      )}
    </section>
  )
}
