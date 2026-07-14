import { useEffect, useState } from 'react'
import type { DataGovernanceStats, SettingsView } from '../../shared/types'
import { McpSettings } from './McpSettings'
import { ModelRoutingSettings } from './ModelRoutingSettings'
import { ProvidersSettings } from './ProvidersSettings'

const MODEL_PRESETS = ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001']
const CUSTOM_MODEL = '__custom__'

export function Settings({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [modelChoice, setModelChoice] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [modelBusy, setModelBusy] = useState(false)
  const [modelError, setModelError] = useState('')
  const [modelSaved, setModelSaved] = useState(false)
  const [maxActiveDraft, setMaxActiveDraft] = useState('3')
  const [maxActiveBusy, setMaxActiveBusy] = useState(false)
  const [maxActiveError, setMaxActiveError] = useState('')
  const [maxActiveSaved, setMaxActiveSaved] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('0')
  const [budgetBusy, setBudgetBusy] = useState(false)
  const [budgetError, setBudgetError] = useState('')
  const [budgetSaved, setBudgetSaved] = useState(false)
  const [snapshotQuotaDraft, setSnapshotQuotaDraft] = useState('250')
  const [snapshotQuotaBusy, setSnapshotQuotaBusy] = useState(false)
  const [snapshotQuotaError, setSnapshotQuotaError] = useState('')
  const [snapshotQuotaSaved, setSnapshotQuotaSaved] = useState(false)
  const [governanceStats, setGovernanceStats] = useState<DataGovernanceStats | null>(null)
  const [shellEnabled, setShellEnabledValue] = useState(false)
  const [shellEnabledBusy, setShellEnabledBusy] = useState(false)
  const [shellEnabledError, setShellEnabledError] = useState('')
  const [shellAllowDraft, setShellAllowDraft] = useState('')
  const [shellAllowBusy, setShellAllowBusy] = useState(false)
  const [shellAllowError, setShellAllowError] = useState('')
  const [shellAllowSaved, setShellAllowSaved] = useState(false)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const [diagnosticsStatus, setDiagnosticsStatus] = useState('')

  const applySettings = (s: SettingsView): void => {
    setSettings(s)
    if (MODEL_PRESETS.includes(s.model)) {
      setModelChoice(s.model)
      setCustomModel('')
    } else {
      setModelChoice(CUSTOM_MODEL)
      setCustomModel(s.model)
    }
    setMaxActiveDraft(String(s.maxActiveTasks))
    setBudgetDraft(String(s.defaultBudgetUsd))
    setSnapshotQuotaDraft(String(s.snapshotQuotaMb))
    setShellEnabledValue(s.shellEnabled)
    setShellAllowDraft(s.shellAllowPrefixes.join('\n'))
  }

  useEffect(() => {
    void window.api.getSettings().then(applySettings)
    void window.api.rpc({ method: 'getDataGovernanceStats' }).then((result) => setGovernanceStats(result as DataGovernanceStats))
  }, [])

  const saveKey = async (): Promise<void> => {
    setKeyBusy(true)
    setKeyError('')
    try {
      const s = await window.api.setApiKey(keyDraft)
      setKeyDraft('')
      applySettings(s)
    } catch (e) {
      setKeyError((e as Error).message)
    } finally {
      setKeyBusy(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    setKeyBusy(true)
    setKeyError('')
    try {
      applySettings(await window.api.clearApiKey())
    } catch (e) {
      setKeyError((e as Error).message)
    } finally {
      setKeyBusy(false)
    }
  }

  const saveModel = async (): Promise<void> => {
    const value = modelChoice === CUSTOM_MODEL ? customModel.trim() : modelChoice
    setModelBusy(true)
    setModelError('')
    setModelSaved(false)
    try {
      applySettings(await window.api.setModel(value))
      setModelSaved(true)
    } catch (e) {
      setModelError((e as Error).message)
    } finally {
      setModelBusy(false)
    }
  }

  const saveMaxActive = async (): Promise<void> => {
    setMaxActiveBusy(true)
    setMaxActiveError('')
    setMaxActiveSaved(false)
    try {
      applySettings(await window.api.setMaxActiveTasks(Number(maxActiveDraft)))
      setMaxActiveSaved(true)
    } catch (e) {
      setMaxActiveError((e as Error).message)
    } finally {
      setMaxActiveBusy(false)
    }
  }

  const saveBudget = async (): Promise<void> => {
    setBudgetBusy(true)
    setBudgetError('')
    setBudgetSaved(false)
    try {
      applySettings(await window.api.setDefaultBudget(Number(budgetDraft)))
      setBudgetSaved(true)
    } catch (e) {
      setBudgetError((e as Error).message)
    } finally {
      setBudgetBusy(false)
    }
  }

  const saveSnapshotQuota = async (): Promise<void> => {
    setSnapshotQuotaBusy(true)
    setSnapshotQuotaError('')
    setSnapshotQuotaSaved(false)
    try {
      applySettings(await window.api.setSnapshotQuota(Number(snapshotQuotaDraft)))
      setSnapshotQuotaSaved(true)
    } catch (e) {
      setSnapshotQuotaError((e as Error).message)
    } finally {
      setSnapshotQuotaBusy(false)
    }
  }

  const toggleShellEnabled = async (): Promise<void> => {
    setShellEnabledBusy(true)
    setShellEnabledError('')
    try {
      applySettings(await window.api.setShellEnabled(!shellEnabled))
    } catch (e) {
      setShellEnabledError((e as Error).message)
    } finally {
      setShellEnabledBusy(false)
    }
  }

  const saveShellAllow = async (): Promise<void> => {
    setShellAllowBusy(true)
    setShellAllowError('')
    setShellAllowSaved(false)
    try {
      const prefixes = shellAllowDraft
        .split('\n')
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.trim().length > 0)
      applySettings(await window.api.setShellAllowPrefixes(prefixes))
      setShellAllowSaved(true)
    } catch (e) {
      setShellAllowError((e as Error).message)
    } finally {
      setShellAllowBusy(false)
    }
  }

  const exportDiagnostics = async (): Promise<void> => {
    setDiagnosticsBusy(true)
    setDiagnosticsStatus('')
    try {
      const result = await window.api.exportDiagnostics()
      setDiagnosticsStatus(result.cancelled ? '' : `已导出 ${result.fileName ?? '诊断包'}`)
    } catch (error) {
      setDiagnosticsStatus(`导出失败：${(error as Error).message}`)
    } finally {
      setDiagnosticsBusy(false)
    }
  }

  if (!settings) {
    return (
      <div className="home">
        <button className="ghost" onClick={onBack}>
          ← 返回
        </button>
        <p className="muted">加载设置…</p>
      </div>
    )
  }

  const modelValue = modelChoice === CUSTOM_MODEL ? customModel.trim() : modelChoice
  const modelUnchanged = modelValue === settings.model

  return (
    <div className="home">
      <button className="ghost" onClick={onBack}>
        ← 返回
      </button>
      <h1>设置</h1>
      <p className="sub">配置模型接入所需的 API Key 与默认模型。</p>

      <section>
        <h2>API Key</h2>
        <div className="input-card">
          {!settings.encryptionAvailable && (
            <div className="error">系统加密不可用，当前设备无法安全保存 API Key。</div>
          )}
          {settings.hasApiKey ? (
            <div className="input-row">
              <span className="meta">已保存（出于安全不回显）</span>
              <button disabled={keyBusy} onClick={() => void clearKey()}>
                清除
              </button>
            </div>
          ) : (
            <>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
              />
              <div className="input-row">
                <button
                  className="primary"
                  disabled={keyBusy || !keyDraft.trim() || !settings.encryptionAvailable}
                  onClick={() => void saveKey()}
                >
                  {keyBusy ? '保存中…' : '保存'}
                </button>
              </div>
            </>
          )}
          {keyError && <div className="error">{keyError}</div>}
        </div>
      </section>

      <ProvidersSettings encryptionAvailable={settings.encryptionAvailable} />

      <ModelRoutingSettings />

      <McpSettings encryptionAvailable={settings.encryptionAvailable} />

      <section>
        <h2>Shell 命令</h2>
        <div className="input-card">
          <label className="input-row meta">
            <input
              type="checkbox"
              checked={shellEnabled}
              disabled={shellEnabledBusy}
              onChange={() => void toggleShellEnabled()}
            />
            允许任务执行 Shell 命令（开启后每次执行仍需逐条批准）
          </label>
          {shellEnabledError && <div className="error">{shellEnabledError}</div>}
          <p className="sub">
            白名单前缀（每行一条；匹配前缀的命令免批准执行，谨慎添加）
          </p>
          <textarea
            value={shellAllowDraft}
            rows={4}
            placeholder={'npm test\ngit status'}
            onChange={(e) => {
              setShellAllowDraft(e.target.value)
              setShellAllowSaved(false)
            }}
          />
          <div className="input-row">
            <button className="primary" disabled={shellAllowBusy} onClick={() => void saveShellAllow()}>
              {shellAllowBusy ? '保存中…' : '保存'}
            </button>
            {shellAllowSaved && <span className="meta">已保存</span>}
          </div>
          {shellAllowError && <div className="error">{shellAllowError}</div>}
        </div>
      </section>

      <section>
        <h2>内置 Anthropic 模型</h2>
        <div className="input-card">
          <select
            value={modelChoice}
            onChange={(e) => {
              setModelChoice(e.target.value)
              setModelSaved(false)
            }}
          >
            {MODEL_PRESETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={CUSTOM_MODEL}>自定义…</option>
          </select>
          {modelChoice === CUSTOM_MODEL && (
            <div className="input-row">
              <input
                value={customModel}
                onChange={(e) => {
                  setCustomModel(e.target.value)
                  setModelSaved(false)
                }}
                placeholder="输入模型标识"
              />
            </div>
          )}
          <div className="input-row">
            <button
              className="primary"
              disabled={modelBusy || !modelValue || modelUnchanged}
              onClick={() => void saveModel()}
            >
              {modelBusy ? '保存中…' : '保存模型'}
            </button>
            {modelSaved && modelUnchanged && <span className="meta">已保存</span>}
          </div>
          {modelError && <div className="error">{modelError}</div>}
        </div>
      </section>

      <section>
        <h2>并发任务上限</h2>
        <div className="input-card">
          <div className="input-row">
            <input
              type="number"
              min={1}
              max={10}
              value={maxActiveDraft}
              onChange={(e) => {
                setMaxActiveDraft(e.target.value)
                setMaxActiveSaved(false)
              }}
            />
            <button
              className="primary"
              disabled={maxActiveBusy || !maxActiveDraft.trim()}
              onClick={() => void saveMaxActive()}
            >
              {maxActiveBusy ? '保存中…' : '保存'}
            </button>
            {maxActiveSaved && <span className="meta">已保存</span>}
          </div>
          {maxActiveError && <div className="error">{maxActiveError}</div>}
        </div>
      </section>

      <section>
        <h2>默认任务预算（USD）</h2>
        <div className="input-card">
          <div className="input-row">
            <input
              type="number"
              min={0}
              step="0.01"
              value={budgetDraft}
              onChange={(e) => {
                setBudgetDraft(e.target.value)
                setBudgetSaved(false)
              }}
              placeholder="0 = 不限"
            />
            <button
              className="primary"
              disabled={budgetBusy || !budgetDraft.trim()}
              onClick={() => void saveBudget()}
            >
              {budgetBusy ? '保存中…' : '保存'}
            </button>
            {budgetSaved && <span className="meta">已保存</span>}
          </div>
          {budgetError && <div className="error">{budgetError}</div>}
        </div>
      </section>

      <section>
        <h2>来源快照配额（MB）</h2>
        <div className="input-card">
          <p className="sub">达到配额时只清理最旧且未被 Evidence 引用的 HTML 快照。</p>
          <div className="input-row">
            <input
              aria-label="来源快照配额"
              type="number"
              min={10}
              max={10000}
              step={1}
              value={snapshotQuotaDraft}
              onChange={(e) => {
                setSnapshotQuotaDraft(e.target.value)
                setSnapshotQuotaSaved(false)
              }}
            />
            <button className="primary" disabled={snapshotQuotaBusy || !snapshotQuotaDraft.trim()} onClick={() => void saveSnapshotQuota()}>
              {snapshotQuotaBusy ? '保存中…' : '保存'}
            </button>
            {snapshotQuotaSaved && <span className="meta">已保存</span>}
          </div>
          {snapshotQuotaError && <div className="error">{snapshotQuotaError}</div>}
          {governanceStats && (
            <p className="meta governance-stats">
              快照 {governanceStats.snapshotCount} 个 · {(governanceStats.snapshotBytes / 1024 / 1024).toFixed(2)} MB<br />
              活跃事件 {governanceStats.liveEventRows} 行 · 已归档事件 {governanceStats.archivedEventRows} 行 · 已归档任务 {governanceStats.archivedTaskCount} 个
            </p>
          )}
        </div>
      </section>

      <section>
        <h2>诊断与日志</h2>
        <div className="input-card">
          <p className="sub">导出版本、系统信息和轮转日志；不包含任务内容、数据库、API Key 或 MCP 密钥。</p>
          <div className="input-row">
            <button disabled={diagnosticsBusy} onClick={() => void exportDiagnostics()}>
              {diagnosticsBusy ? '导出中…' : '导出诊断包'}
            </button>
            {diagnosticsStatus && <span role="status" className="meta">{diagnosticsStatus}</span>}
          </div>
        </div>
      </section>

      <p className="sub settings-note">
        密钥经 macOS 钥匙串派生密钥加密后存储在本机，明文不落盘、不入库、不回显。
      </p>
    </div>
  )
}
