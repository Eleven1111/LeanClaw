import { useEffect, useRef, useState } from 'react'
import type {
  ProviderKind,
  ProvidersView,
  ProviderUpsertInput,
  ProviderView
} from '../../shared/types'

const DELETE_CONFIRM_MS = 3000

interface ProviderPreset {
  label: string
  name: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: 'DeepSeek',
    name: 'DeepSeek',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat'
  },
  {
    label: '火山方舟（Volcengine Ark）',
    name: '火山方舟',
    kind: 'openai-compat',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k'
  },
  {
    label: 'OpenRouter',
    name: 'OpenRouter',
    kind: 'openai-compat',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini'
  },
  {
    label: 'Gemini（OpenAI 兼容）',
    name: 'Gemini',
    kind: 'openai-compat',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash'
  },
  {
    label: '小米 MiMo',
    name: '小米 MiMo',
    kind: 'openai-compat',
    baseUrl: '',
    defaultModel: 'mimo-7b-rl'
  },
  { label: '自定义（OpenAI 兼容）', name: '', kind: 'openai-compat', baseUrl: '', defaultModel: '' }
]

interface FormState {
  id: string | null
  name: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
  inputPrice: string
  outputPrice: string
  keyDraft: string
  hasKey: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  kind: 'openai-compat',
  baseUrl: '',
  defaultModel: '',
  inputPrice: '',
  outputPrice: '',
  keyDraft: '',
  hasKey: false
}

interface TestState {
  busy: boolean
  ok: boolean | null
  message: string
}

export function ProvidersSettings({
  encryptionAvailable
}: {
  encryptionAvailable: boolean
}): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [presetChoice, setPresetChoice] = useState('')
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyView = (v: ProvidersView): void => {
    setProviders(v.providers)
    setDefaultProviderId(v.defaultProviderId)
  }

  useEffect(() => {
    void window.api.getProviders().then(applyView)
  }, [])

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const openAddForm = (): void => {
    setForm(EMPTY_FORM)
    setPresetChoice('')
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (p: ProviderView): void => {
    setForm({
      id: p.id,
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      inputPrice: p.inputPricePerM === null ? '' : String(p.inputPricePerM),
      outputPrice: p.outputPricePerM === null ? '' : String(p.outputPricePerM),
      keyDraft: '',
      hasKey: p.hasKey
    })
    setPresetChoice('')
    setFormError('')
    setShowForm(true)
  }

  const applyPreset = (label: string): void => {
    setPresetChoice(label)
    const preset = PROVIDER_PRESETS.find((p) => p.label === label)
    if (!preset) return
    setForm((f) => ({
      ...f,
      name: preset.name,
      kind: preset.kind,
      baseUrl: preset.baseUrl,
      defaultModel: preset.defaultModel
    }))
  }

  const saveForm = async (): Promise<void> => {
    setFormBusy(true)
    setFormError('')
    try {
      const input: ProviderUpsertInput = {
        ...(form.id ? { id: form.id } : {}),
        name: form.name,
        kind: form.kind,
        baseUrl: form.baseUrl,
        defaultModel: form.defaultModel,
        inputPricePerM: form.inputPrice.trim() === '' ? null : Number(form.inputPrice),
        outputPricePerM: form.outputPrice.trim() === '' ? null : Number(form.outputPrice)
      }
      const prevIds = new Set(providers.map((p) => p.id))
      let view = await window.api.upsertProvider(input)
      const targetId = form.id ?? view.providers.find((p) => !prevIds.has(p.id))?.id
      if (targetId && form.keyDraft.trim()) {
        view = await window.api.setProviderKey(targetId, form.keyDraft.trim())
      }
      applyView(view)
      setShowForm(false)
      setForm(EMPTY_FORM)
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setFormBusy(false)
    }
  }

  const clearKeyForEditing = async (): Promise<void> => {
    if (!form.id) return
    setFormBusy(true)
    setFormError('')
    try {
      applyView(await window.api.clearProviderKey(form.id))
      setForm((f) => ({ ...f, hasKey: false }))
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setFormBusy(false)
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
      void window.api.deleteProvider(id).then(applyView)
      return
    }
    clearConfirmTimer()
    setConfirmDeleteId(id)
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), DELETE_CONFIRM_MS)
  }

  const runTest = async (id: string): Promise<void> => {
    setTests((t) => ({ ...t, [id]: { busy: true, ok: null, message: '测试中…' } }))
    try {
      const r = await window.api.testProvider(id)
      setTests((t) => ({ ...t, [id]: { busy: false, ok: r.ok, message: r.message } }))
    } catch (e) {
      setTests((t) => ({ ...t, [id]: { busy: false, ok: false, message: (e as Error).message } }))
    }
  }

  const changeDefault = (value: string): void => {
    void window.api.setDefaultProvider(value === '' ? null : value).then(applyView)
  }

  return (
    <section>
      <h2>模型服务商</h2>
      <p className="sub">
        接入 Anthropic 之外的模型（DeepSeek、火山方舟、Gemini、OpenRouter 等 OpenAI 兼容端点）。密钥经加密存储，明文不落盘、不回显。
      </p>

      {providers.length > 0 && (
        <div className="card-grid">
          {providers.map((p) => {
            const test = tests[p.id]
            return (
              <div key={p.id} className="card provider-card">
                <h3>{p.name}</h3>
                <p className="recipe-meta muted">
                  {p.kind === 'anthropic' ? 'Anthropic 原生' : 'OpenAI 兼容'} ·{' '}
                  {p.defaultModel}
                </p>
                <p className="muted provider-baseurl">{p.baseUrl}</p>
                <p className="meta">密钥：{p.hasKey ? '已保存' : '未设置'}</p>
                <div className="actions">
                  <button disabled={!p.hasKey || test?.busy} onClick={() => void runTest(p.id)}>
                    {test?.busy ? '测试中…' : '测试连接'}
                  </button>
                  <button className="ghost small" onClick={() => openEditForm(p)}>
                    编辑
                  </button>
                  <button
                    className={confirmDeleteId === p.id ? 'danger-confirm' : ''}
                    onClick={() => handleDelete(p.id)}
                  >
                    {confirmDeleteId === p.id ? '确认删除' : '删除'}
                  </button>
                </div>
                {test && !test.busy && (
                  <p className={test.ok ? 'meta' : 'error'}>{test.message}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="input-card">
        <label className="meta" htmlFor="default-provider">
          默认服务商
        </label>
        <select
          id="default-provider"
          value={defaultProviderId ?? ''}
          onChange={(e) => changeDefault(e.target.value)}
        >
          <option value="">内置 Anthropic / Mock（跟随环境）</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.hasKey}>
              {p.name}
              {p.hasKey ? '' : '（未设置密钥）'}
            </option>
          ))}
        </select>
      </div>

      {showForm ? (
        <div className="input-card">
          <h3>{form.id ? '编辑服务商' : '添加服务商'}</h3>
          {!form.id && (
            <div className="input-row">
              <select value={presetChoice} onChange={(e) => applyPreset(e.target.value)}>
                <option value="">从预置目录快速填充…</option>
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            value={form.name}
            maxLength={40}
            placeholder="名称（如 DeepSeek）"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="input-row">
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ProviderKind }))}
            >
              <option value="openai-compat">OpenAI 兼容</option>
              <option value="anthropic">Anthropic 原生</option>
            </select>
          </div>
          <input
            value={form.baseUrl}
            placeholder="baseUrl（https:// 开头）"
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          />
          <input
            value={form.defaultModel}
            maxLength={128}
            placeholder="默认模型标识"
            onChange={(e) => setForm((f) => ({ ...f, defaultModel: e.target.value }))}
          />
          <div className="input-row">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.inputPrice}
              placeholder="输入价格 /百万 token（可选）"
              onChange={(e) => setForm((f) => ({ ...f, inputPrice: e.target.value }))}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.outputPrice}
              placeholder="输出价格 /百万 token（可选）"
              onChange={(e) => setForm((f) => ({ ...f, outputPrice: e.target.value }))}
            />
          </div>
          <input
            type="password"
            value={form.keyDraft}
            autoComplete="off"
            placeholder={form.id && form.hasKey ? '密钥（留空 = 不修改）' : '密钥'}
            onChange={(e) => setForm((f) => ({ ...f, keyDraft: e.target.value }))}
          />
          {!encryptionAvailable && (
            <div className="error">系统加密不可用，当前设备无法安全保存密钥。</div>
          )}
          {formError && <div className="error">{formError}</div>}
          <div className="input-row">
            <button className="primary" disabled={formBusy} onClick={() => void saveForm()}>
              {formBusy ? '保存中…' : '保存'}
            </button>
            {form.id && form.hasKey && (
              <button disabled={formBusy} onClick={() => void clearKeyForEditing()}>
                清除密钥
              </button>
            )}
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
          添加服务商
        </button>
      )}
    </section>
  )
}
