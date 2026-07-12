import { useEffect, useRef, useState } from 'react'
import type { PresetView, RecipeView } from '../../shared/types'

const DELETE_CONFIRM_MS = 3000

function PresetCard({
  preset,
  onUse,
  onDelete,
  confirming
}: {
  preset: PresetView
  onUse: (preset: PresetView) => void
  onDelete: (id: string) => void
  confirming: boolean
}): React.JSX.Element {
  return (
    <div className="card preset-card">
      <h3>{preset.name}</h3>
      <p className="muted preset-goal">{preset.goal}</p>
      <p className="recipe-meta muted">
        {preset.recipeTitle}
        {preset.invalid ? '（Recipe 已不存在）' : ''} · {new Date(preset.createdAt).toLocaleDateString()}
      </p>
      <div className="actions">
        <button className="primary" disabled={preset.invalid} onClick={() => onUse(preset)}>
          用这个预设发起
        </button>
        <button
          className={confirming ? 'danger-confirm' : ''}
          onClick={() => onDelete(preset.id)}
        >
          {confirming ? '确认删除' : '删除'}
        </button>
      </div>
    </div>
  )
}

export function Library({
  onUseRecipe,
  onUsePreset
}: {
  onUseRecipe: (recipeId: string) => void
  onUsePreset: (preset: PresetView) => void
}): React.JSX.Element {
  const [recipes, setRecipes] = useState<RecipeView[]>([])
  const [presets, setPresets] = useState<PresetView[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void Promise.all([
      window.api.rpc({ method: 'listRecipes' }),
      window.api.rpc({ method: 'listPresets' })
    ]).then(([r, p]) => {
      setRecipes(r as RecipeView[])
      setPresets(p as PresetView[])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const clearConfirmTimer = (): void => {
    if (confirmTimer.current) {
      clearTimeout(confirmTimer.current)
      confirmTimer.current = null
    }
  }

  const handleDeleteClick = (id: string): void => {
    if (confirmDeleteId === id) {
      clearConfirmTimer()
      setConfirmDeleteId(null)
      void window.api.rpc({ method: 'deletePreset', presetId: id }).then(() => {
        setPresets((prev) => prev.filter((p) => p.id !== id))
      })
      return
    }
    clearConfirmTimer()
    setConfirmDeleteId(id)
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), DELETE_CONFIRM_MS)
  }

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Library</h1>
          <p className="sub">内置 Recipe，一键套用已验证过的执行流程。</p>
        </div>
      </div>

      {loading ? (
        <p className="muted">加载中…</p>
      ) : (
        <>
          {presets.length > 0 && (
            <section>
              <h2>我的预设</h2>
              <div className="card-grid">
                {presets.map((p) => (
                  <PresetCard
                    key={p.id}
                    preset={p}
                    onUse={onUsePreset}
                    onDelete={handleDeleteClick}
                    confirming={confirmDeleteId === p.id}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="card-grid">
            {recipes.map((r) => (
              <div key={r.id} className="card recipe-card">
                <h3>{r.title}</h3>
                <p className="muted">{r.goal}</p>
                <p className="recipe-meta muted">
                  {r.stepCount} 步 · {r.verifyCount} 道验证门
                </p>
                <button className="primary" onClick={() => onUseRecipe(r.id)}>
                  用这个模板发起任务
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
