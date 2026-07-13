import { useEffect, useState } from 'react'
import type { RecipeView, TaskView } from '../../shared/types'

export function QuickCapture(): React.JSX.Element {
  const [goal, setGoal] = useState('')
  const [recipes, setRecipes] = useState<RecipeView[]>([])
  const [recipeId, setRecipeId] = useState('deep-research')
  const [inputPath, setInputPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api.rpc({ method: 'listRecipes' }).then((result) => {
      const next = result as RecipeView[]
      setRecipes(next)
      if (!next.some((recipe) => recipe.id === 'deep-research')) setRecipeId(next[0]?.id ?? '')
    })
  }, [])

  const selected = recipes.find((recipe) => recipe.id === recipeId)
  const submit = async (): Promise<void> => {
    if (!goal.trim() || !recipeId || (selected?.requiresInput && !inputPath.trim())) return
    setBusy(true)
    setError('')
    try {
      const task = await window.api.rpc({
        method: 'createTask',
        goal: goal.trim(),
        inputPath: selected?.requiresInput ? inputPath.trim() : '',
        recipeId
      }) as TaskView
      await window.api.rpc({ method: 'startTask', taskId: task.id })
      await window.api.closeQuickCapture()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="quick-capture">
      <div className="quick-head"><strong>快速交代任务</strong><kbd>⌥Space</kbd></div>
      <textarea
        autoFocus
        aria-label="任务目标"
        placeholder="你希望 LeanClaw 完成什么？"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') void window.api.closeQuickCapture()
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit()
        }}
      />
      <div className="quick-actions">
        <select aria-label="Recipe" value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
          {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}</option>)}
        </select>
        {selected?.requiresInput && <input aria-label="输入文件" placeholder="输入文件路径" value={inputPath} onChange={(event) => setInputPath(event.target.value)} />}
        <button className="primary" disabled={busy || !goal.trim() || !recipeId || Boolean(selected?.requiresInput && !inputPath.trim())} onClick={() => void submit()}>
          {busy ? '提交中…' : '开始'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </main>
  )
}
