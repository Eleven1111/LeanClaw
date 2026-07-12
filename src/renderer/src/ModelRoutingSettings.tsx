import { useEffect, useState } from 'react'
import type { ModelTier, ProviderView, TierMapView } from '../../shared/types'

const MOCK_ID = 'mock'

const TIERS: { id: ModelTier; label: string }[] = [
  { id: 'planning', label: '规划' },
  { id: 'generation', label: '生成' },
  { id: 'extraction', label: '抽取' },
  { id: 'review', label: '评审' }
]

interface RowState {
  providerId: string
  model: string
  fallbackProviderId: string
  fallbackModel: string
}

const EMPTY_ROW: RowState = { providerId: '', model: '', fallbackProviderId: '', fallbackModel: '' }

function rowFrom(route: TierMapView[ModelTier]): RowState {
  if (!route) return EMPTY_ROW
  return {
    providerId: route.providerId,
    model: route.model,
    fallbackProviderId: route.fallback?.providerId ?? '',
    fallbackModel: route.fallback?.model ?? ''
  }
}

export function ModelRoutingSettings(): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderView[]>([])
  const [tierMap, setTierMapState] = useState<TierMapView>({})
  const [rows, setRows] = useState<Record<ModelTier, RowState>>({
    planning: EMPTY_ROW,
    generation: EMPTY_ROW,
    extraction: EMPTY_ROW,
    review: EMPTY_ROW
  })
  const [busy, setBusy] = useState<ModelTier | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ModelTier, string>>>({})

  const applyView = (v: TierMapView): void => {
    setTierMapState(v)
    setRows({
      planning: rowFrom(v.planning),
      generation: rowFrom(v.generation),
      extraction: rowFrom(v.extraction),
      review: rowFrom(v.review)
    })
  }

  useEffect(() => {
    void window.api.getProviders().then((v) => setProviders(v.providers))
    void window.api.getTierMap().then(applyView)
  }, [])

  const updateRow = (tier: ModelTier, patch: Partial<RowState>): void => {
    setRows((r) => ({ ...r, [tier]: { ...r[tier], ...patch } }))
  }

  const save = async (tier: ModelTier): Promise<void> => {
    const row = rows[tier]
    setBusy(tier)
    setErrors((e) => ({ ...e, [tier]: '' }))
    try {
      const view = await window.api.setTierRoute({
        tier,
        providerId: row.providerId,
        model: row.model,
        fallback: row.fallbackProviderId
          ? { providerId: row.fallbackProviderId, model: row.fallbackModel }
          : null
      })
      applyView(view)
    } catch (e) {
      setErrors((prev) => ({ ...prev, [tier]: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const clear = async (tier: ModelTier): Promise<void> => {
    setBusy(tier)
    setErrors((e) => ({ ...e, [tier]: '' }))
    try {
      applyView(await window.api.clearTierRoute(tier))
    } catch (e) {
      setErrors((prev) => ({ ...prev, [tier]: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const primaryOptions = providers.filter((p) => p.hasKey)

  return (
    <section>
      <h2>模型路由</h2>
      <p className="sub">路由按步骤类型生效：规划 / 生成 / 抽取 / 评审。</p>
      <div className="card-grid">
        {TIERS.map(({ id, label }) => {
          const row = rows[id]
          return (
            <div key={id} className="card">
              <h3>{label}</h3>
              <div className="input-row">
                <select
                  value={row.providerId}
                  onChange={(e) => updateRow(id, { providerId: e.target.value })}
                >
                  <option value="">默认链路</option>
                  {primaryOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  value={row.model}
                  maxLength={128}
                  placeholder="主选模型标识"
                  disabled={!row.providerId}
                  onChange={(e) => updateRow(id, { model: e.target.value })}
                />
              </div>
              <div className="input-row">
                <select
                  value={row.fallbackProviderId}
                  onChange={(e) => updateRow(id, { fallbackProviderId: e.target.value })}
                >
                  <option value="">无</option>
                  <option value={MOCK_ID}>本地 Mock</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  value={row.fallbackModel}
                  maxLength={128}
                  placeholder="备选模型标识"
                  disabled={!row.fallbackProviderId}
                  onChange={(e) => updateRow(id, { fallbackModel: e.target.value })}
                />
              </div>
              <div className="input-row">
                <button
                  className="primary"
                  disabled={busy === id || !row.providerId || !row.model.trim()}
                  onClick={() => void save(id)}
                >
                  {busy === id ? '保存中…' : '保存'}
                </button>
                <button disabled={busy === id || !tierMap[id]} onClick={() => void clear(id)}>
                  清除
                </button>
              </div>
              {errors[id] && <div className="error">{errors[id]}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
