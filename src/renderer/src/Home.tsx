import { useEffect, useState } from 'react'
import type {
  AgentView,
  NeedYouItemView,
  ProjectView,
  RecipeView,
  TaskView
} from '../../shared/types'
import { StatusChip } from './TaskWorkspace'
import { Schedules } from './Schedules'
import { actionPhrase } from '../../shared/progress'
import { NeedYouList } from './NeedYou'

const DEFAULT_RECIPE_ID = 'file-edit-summarize'
const RESEARCH_GOAL = '研究 AI Agent 桌面应用的最新发展，输出带引用的分析报告。'

function TaskRow({ t, onOpen }: { t: TaskView; onOpen: (id: string) => void }): React.JSX.Element {
  const runningStep = t.steps.find((s) => s.status === 'running')
  const lastDone = [...t.steps].reverse().find((s) => s.status === 'done')
  const progress = runningStep ? actionPhrase(runningStep.title) : lastDone?.outputSummary ?? lastDone?.title ?? ''
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
  recipeId?: string
  goal?: string
  inputPath?: string
  budgetUsd?: number
  agentId?: string
}

export function Home({
  tasks,
  needYouItems,
  needYouLoading,
  needYouError,
  onRefreshNeedYou,
  onOpen,
  initialPreset,
  onViewAutomations,
  onViewAllNeedYou,
  onViewAllDelivered
}: {
  tasks: TaskView[]
  needYouItems: NeedYouItemView[]
  needYouLoading: boolean
  needYouError: string
  onRefreshNeedYou: () => Promise<void>
  onOpen: (id: string) => void
  initialPreset?: InitialPreset
  onViewAutomations: () => void
  onViewAllNeedYou: () => void
  onViewAllDelivered: () => void
}): React.JSX.Element {
  const [goal, setGoal] = useState(initialPreset?.goal ?? '')
  const [inputPath, setInputPath] = useState(initialPreset?.inputPath ?? '')
  const [budgetDraft, setBudgetDraft] = useState(
    initialPreset?.budgetUsd === undefined ? '' : String(initialPreset.budgetUsd)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recipes, setRecipes] = useState<RecipeView[]>([])
  const [recipeId, setRecipeId] = useState(initialPreset?.recipeId ?? DEFAULT_RECIPE_ID)
  const [sampleGoal, setSampleGoal] = useState('')
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [projectId, setProjectId] = useState('')
  const [agents, setAgents] = useState<AgentView[]>([])
  const [agentId, setAgentId] = useState(initialPreset?.agentId ?? '')

  useEffect(() => {
    void window.api.rpc({ method: 'getDefaults' }).then((d) => {
      const defaults = d as { samplePath: string; sampleGoal: string }
      setSampleGoal(defaults.sampleGoal)
      setGoal((g) => g || defaults.sampleGoal)
      setInputPath((p) => p || defaults.samplePath)
    })
    void window.api.rpc({ method: 'listRecipes' }).then((r) => setRecipes(r as RecipeView[]))
    void window.api.rpc({ method: 'listProjects' }).then((r) => setProjects(r as ProjectView[]))
    void window.api.rpc({ method: 'listAgents' }).then((r) => setAgents(r as AgentView[]))
  }, [])

  useEffect(() => {
    if (!initialPreset) return
    if (initialPreset.recipeId) setRecipeId(initialPreset.recipeId)
    if (initialPreset.goal !== undefined) setGoal(initialPreset.goal)
    if (initialPreset.inputPath !== undefined) setInputPath(initialPreset.inputPath)
    if (initialPreset.budgetUsd !== undefined) setBudgetDraft(String(initialPreset.budgetUsd))
    if (initialPreset.agentId !== undefined) setAgentId(initialPreset.agentId)
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

  const changeAgent = (id: string): void => {
    setAgentId(id)
    const agent = agents.find((candidate) => candidate.id === id)
    if (!agent) return
    if (agent.defaultRecipeId) changeRecipe(agent.defaultRecipeId)
    if (agent.defaultBudgetUsd !== null) setBudgetDraft(String(agent.defaultBudgetUsd))
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
        ...(agentId ? { agentId } : {}),
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

      {(needYouItems.length > 0 || needYouError) && (
        <section className="home-need-you">
          <div className="section-head">
            <div>
              <h2>需要你处理</h2>
              <p>{needYouItems.length} 个事项正在等待决定</p>
            </div>
            <button className="ghost small" onClick={onViewAllNeedYou} aria-label="查看全部待处理">
              查看全部 →
            </button>
          </div>
          <NeedYouList
            items={needYouItems.slice(0, 3)}
            loading={needYouLoading}
            error={needYouError}
            onRefresh={onRefreshNeedYou}
            onOpenTask={onOpen}
            compact
          />
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
        <div className="agent-row">
          <select aria-label="Agent" value={agentId} onChange={(e) => changeAgent(e.target.value)}>
            <option value="">默认执行器</option>
            {agents
              .filter((agent) => agent.enabled || agent.id === agentId)
              .map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </div>
        <div className="recipe-row">
          <select aria-label="Recipe" value={recipeId} onChange={(e) => changeRecipe(e.target.value)}>
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
            aria-label="预算 USD（可选）"
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
        onViewAutomations={onViewAutomations}
        template={{ goal, inputPath: requiresInput ? inputPath : '', recipeId,
          ...(projectId ? { projectId } : {}),
          ...(agentId ? { agentId } : {}),
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
