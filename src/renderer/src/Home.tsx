import { useEffect, useState } from 'react'
import type { ProjectView, RecipeView, TaskView } from '../../shared/types'
import { StatusChip } from './TaskWorkspace'
import { Schedules } from './Schedules'

const DEFAULT_RECIPE_ID = 'file-edit-summarize'
const RESEARCH_GOAL = '研究 AI Agent 桌面应用的最新发展，输出带引用的分析报告。'

function TaskRow({ t, onOpen }: { t: TaskView; onOpen: (id: string) => void }): React.JSX.Element {
  const runningStep = t.steps.find((s) => s.status === 'running')
  const lastDone = [...t.steps].reverse().find((s) => s.status === 'done')
  const progress = runningStep?.title ?? lastDone?.outputSummary ?? lastDone?.title ?? ''
  return (
    <button className="task-row" onClick={() => onOpen(t.id)}>
      <span className="task-goal">{t.goal}</span>
      <span className="task-progress">{progress}</span>
      {t.queuePosition !== null && <span className="queue-badge">排队中 · 第 {t.queuePosition} 位</span>}
      <StatusChip s={t.userStatus} />
    </button>
  )
}

interface InitialPreset {
  recipeId: string
  goal?: string
  inputPath?: string
}

export function Home({
  tasks,
  onOpen,
  initialPreset,
  onViewAllDelivered
}: {
  tasks: TaskView[]
  onOpen: (id: string) => void
  initialPreset?: InitialPreset
  onViewAllDelivered: () => void
}): React.JSX.Element {
  const [goal, setGoal] = useState(initialPreset?.goal ?? '')
  const [inputPath, setInputPath] = useState(initialPreset?.inputPath ?? '')
  const [budgetDraft, setBudgetDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recipes, setRecipes] = useState<RecipeView[]>([])
  const [recipeId, setRecipeId] = useState(initialPreset?.recipeId ?? DEFAULT_RECIPE_ID)
  const [sampleGoal, setSampleGoal] = useState('')
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    void window.api.rpc({ method: 'getDefaults' }).then((d) => {
      const defaults = d as { samplePath: string; sampleGoal: string }
      setSampleGoal(defaults.sampleGoal)
      setGoal((g) => g || defaults.sampleGoal)
      setInputPath((p) => p || defaults.samplePath)
    })
    void window.api.rpc({ method: 'listRecipes' }).then((r) => setRecipes(r as RecipeView[]))
    void window.api.rpc({ method: 'listProjects' }).then((r) => setProjects(r as ProjectView[]))
  }, [])

  useEffect(() => {
    if (!initialPreset) return
    setRecipeId(initialPreset.recipeId)
    if (initialPreset.goal !== undefined) setGoal(initialPreset.goal)
    if (initialPreset.inputPath !== undefined) setInputPath(initialPreset.inputPath)
  }, [initialPreset])

  const selectedRecipe = recipes.find((r) => r.id === recipeId)
  const requiresInput = selectedRecipe?.requiresInput ?? true

  const changeRecipe = (id: string): void => {
    const info = recipes.find((r) => r.id === id)
    const needsInput = info?.requiresInput ?? true
    setRecipeId(id)
    if (!needsInput) {
      setGoal((g) => (!g.trim() || g === sampleGoal ? RESEARCH_GOAL : g))
      setInputPath('')
    } else {
      setGoal((g) => (!g.trim() || g === RESEARCH_GOAL ? sampleGoal : g))
    }
  }

  const start = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const budgetUsd = budgetDraft.trim() ? Number(budgetDraft) : undefined
      const t = (await window.api.rpc({
        method: 'createTask',
        goal,
        inputPath: requiresInput ? inputPath : '',
        recipeId,
        ...(projectId ? { projectId } : {}),
        ...(budgetUsd !== undefined ? { budgetUsd } : {})
      })) as TaskView
      await window.api.rpc({ method: 'startTask', taskId: t.id })
      onOpen(t.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const needYou = tasks.filter((t) => t.userStatus === 'Waiting for You' || t.userStatus === 'Blocked')
  const running = tasks.filter((t) => ['Planning', 'Running', 'Verifying'].includes(t.userStatus))
  const delivered = tasks
    .filter((t) => t.userStatus === 'Delivered')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const recentDelivered = delivered.slice(0, 3)

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>LeanClaw</h1>
          <p className="sub">交代一个任务，交付一个成果。</p>
        </div>
      </div>

      {needYou.length > 0 && (
        <section>
          <h2>需要你处理</h2>
          {needYou.map((t) => (
            <TaskRow key={t.id} t={t} onOpen={onOpen} />
          ))}
        </section>
      )}

      <div
        className="input-card"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!requiresInput) return
          const f = e.dataTransfer.files[0]
          if (f) setInputPath(window.api.getPathForFile(f))
        }}
      >
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          placeholder={requiresInput ? '用一句话交代一个完整任务…' : '用一句话交代一个研究任务…'}
        />
        <div className="recipe-row">
          <select value={recipeId} onChange={(e) => changeRecipe(e.target.value)}>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
        <div className="recipe-row">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
            <option value="">无项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>
        <div className="input-row">
          {requiresInput && (
            <input
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="输入文件路径（可直接拖入文件）"
            />
          )}
          <input
            type="number"
            min={0}
            step="0.01"
            className="budget-input"
            value={budgetDraft}
            onChange={(e) => setBudgetDraft(e.target.value)}
            placeholder="预算 USD（可选）"
          />
          <button
            className="primary"
            disabled={busy || !goal.trim() || (requiresInput && !inputPath.trim())}
            onClick={() => void start()}
          >
            {busy ? '启动中…' : '开始任务'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <Schedules
        disabled={!goal.trim() || (requiresInput && !inputPath.trim())}
        template={{ goal, inputPath: requiresInput ? inputPath : '', recipeId,
          ...(projectId ? { projectId } : {}),
          ...(budgetDraft.trim() ? { budgetUsd: Number(budgetDraft) } : {}) }}
      />

      {running.length > 0 && (
        <section>
          <h2>进行中</h2>
          {running.map((t) => (
            <TaskRow key={t.id} t={t} onOpen={onOpen} />
          ))}
        </section>
      )}

      {recentDelivered.length > 0 && (
        <section>
          <div className="section-head">
            <h2>最近交付</h2>
            <button className="ghost small" onClick={onViewAllDelivered}>
              查看全部 →
            </button>
          </div>
          {recentDelivered.map((t) => (
            <TaskRow key={t.id} t={t} onOpen={onOpen} />
          ))}
        </section>
      )}
    </div>
  )
}
