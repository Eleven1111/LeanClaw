import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentView,
  NeedYouItemView,
  PresetView,
  RuntimeOverviewView,
  TaskView
} from '../../shared/types'
import { Home } from './Home'
import { Settings, type SettingsSection } from './Settings'
import { TaskWorkspace } from './TaskWorkspace'
import { Deliverables } from './Deliverables'
import { Library } from './Library'
import { RunInspector } from './RunInspector'
import { Tasks } from './Tasks'
import { Projects } from './Projects'
import { Agents } from './Agents'
import { RuntimeCenter, runtimeOverallLabel } from './RuntimeCenter'
import { NeedYou } from './NeedYou'
import type { TaskFilter } from './Tasks'
import { CommandPalette, type PaletteCommand } from './CommandPalette'
import appIconUrl from '../../../resources/icon.png'

type ViewId =
  | 'home'
  | 'task'
  | 'tasks'
  | 'needYou'
  | 'projects'
  | 'agents'
  | 'deliverables'
  | 'library'
  | 'runtime'
  | 'settings'
  | 'inspector'

interface InitialPreset {
  recipeId?: string
  goal?: string
  inputPath?: string
  budgetUsd?: number
  agentId?: string
}

type NavGroup = 'workspace' | 'assets' | 'system'

const NAV_ITEMS: { id: ViewId; label: string; title: string; group: NavGroup }[] = [
  { id: 'home', label: 'Home', title: '发起任务', group: 'workspace' },
  { id: 'tasks', label: 'Tasks', title: '任务', group: 'workspace' },
  { id: 'needYou', label: 'Need You', title: '需要你处理', group: 'workspace' },
  { id: 'projects', label: 'Projects', title: '项目', group: 'workspace' },
  { id: 'agents', label: 'Agent', title: 'Agent', group: 'workspace' },
  { id: 'deliverables', label: 'Deliverables', title: '交付物', group: 'assets' },
  { id: 'library', label: 'Library', title: '能力库', group: 'assets' },
  { id: 'runtime', label: 'Runtime', title: '运行时', group: 'system' },
  { id: 'settings', label: 'Settings', title: '设置', group: 'system' }
]

const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: 'workspace', label: '工作区' },
  { id: 'assets', label: '资料与交付' },
  { id: 'system', label: '系统' }
]

const PAGE_TITLES: Record<ViewId, string> = {
  home: '新任务',
  task: '任务详情',
  tasks: '任务',
  needYou: '需要你处理',
  projects: '项目',
  agents: 'Agent',
  deliverables: '交付物',
  library: '能力库',
  runtime: '运行时',
  settings: '设置',
  inspector: '运行检查'
}

export function App(): React.JSX.Element {
  const [tasks, setTasks] = useState<Record<string, TaskView>>({})
  const [view, setView] = useState<ViewId>('home')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [initialPreset, setInitialPreset] = useState<InitialPreset | undefined>(undefined)
  const [initialTasksFilter, setInitialTasksFilter] = useState<TaskFilter | undefined>(undefined)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [inspectorStepId, setInspectorStepId] = useState<string | null>(null)
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined)
  const [runtimeOverview, setRuntimeOverview] = useState<RuntimeOverviewView | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [runtimeError, setRuntimeError] = useState('')
  const [needYouItems, setNeedYouItems] = useState<NeedYouItemView[]>([])
  const [needYouLoading, setNeedYouLoading] = useState(true)
  const [needYouError, setNeedYouError] = useState('')
  const runtimeRequest = useRef<Promise<void> | null>(null)
  const runtimeRefreshQueued = useRef(false)
  const needYouRequest = useRef<Promise<void> | null>(null)
  const needYouRefreshQueued = useRef(false)
  const contentArea = useRef<HTMLDivElement | null>(null)

  const refreshRuntimeOverview = useCallback((): Promise<void> => {
    if (runtimeRequest.current) {
      runtimeRefreshQueued.current = true
      return runtimeRequest.current
    }
    setRuntimeLoading(true)
    setRuntimeError('')
    const request = (async () => {
      try {
        const overview = (await window.api.rpc({
          method: 'getRuntimeOverview'
        })) as RuntimeOverviewView
        setRuntimeOverview(overview)
      } catch {
        setRuntimeError('刷新失败，当前显示上一次安全状态。')
      } finally {
        setRuntimeLoading(false)
        runtimeRequest.current = null
        if (runtimeRefreshQueued.current) {
          runtimeRefreshQueued.current = false
          void refreshRuntimeOverview()
        }
      }
    })()
    runtimeRequest.current = request
    return request
  }, [])

  const refresh = useCallback(async () => {
    const list = (await window.api.rpc({ method: 'listTasks' })) as TaskView[]
    setTasks(Object.fromEntries(list.map((t) => [t.id, t])))
  }, [])

  const refreshNeedYou = useCallback((): Promise<void> => {
    if (needYouRequest.current) {
      needYouRefreshQueued.current = true
      return needYouRequest.current
    }
    setNeedYouLoading(true)
    setNeedYouError('')
    const request = (async () => {
      try {
        const items = (await window.api.rpc({
          method: 'listNeedYouItems'
        })) as NeedYouItemView[]
        setNeedYouItems(items)
      } catch {
        setNeedYouError('刷新失败，待处理事项仍保留在当前页面。')
      } finally {
        setNeedYouLoading(false)
        needYouRequest.current = null
        if (needYouRefreshQueued.current) {
          needYouRefreshQueued.current = false
          void refreshNeedYou()
        }
      }
    })()
    needYouRequest.current = request
    return request
  }, [])

  useEffect(() => {
    void refresh()
    void refreshNeedYou()
    return window.api.onPush((e) => {
      if (e.type === 'task') {
        setTasks((prev) => ({ ...prev, [e.task.id]: e.task }))
        void refreshRuntimeOverview()
        void refreshNeedYou()
      }
    })
  }, [refresh, refreshNeedYou, refreshRuntimeOverview])

  useEffect(() => {
    void refreshRuntimeOverview()
    const timer = window.setInterval(() => void refreshRuntimeOverview(), 15_000)
    return () => window.clearInterval(timer)
  }, [refreshRuntimeOverview])

  const list = Object.values(tasks).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const current = selectedTaskId ? tasks[selectedTaskId] : null

  const openTask = (id: string): void => {
    setSelectedTaskId(id)
    setView('task')
  }

  const navigate = (id: ViewId): void => {
    contentArea.current?.scrollTo({ top: 0 })
    setSelectedTaskId(null)
    setInitialPreset(undefined)
    setInitialTasksFilter(undefined)
    setInspectorStepId(null)
    setSettingsSection(undefined)
    setView(id)
  }

  const openSettings = (section: SettingsSection): void => {
    contentArea.current?.scrollTo({ top: 0 })
    setSelectedTaskId(null)
    setSettingsSection(section)
    setView('settings')
  }

  const openTasksFiltered = (filter: TaskFilter): void => {
    setSelectedTaskId(null)
    setInitialPreset(undefined)
    setInitialTasksFilter(filter)
    setView('tasks')
  }

  const useRecipeAsTask = (recipeId: string): void => {
    setSelectedTaskId(null)
    setInitialPreset({ recipeId })
    setView('home')
  }

  const usePresetAsTask = (preset: PresetView): void => {
    setSelectedTaskId(null)
    setInitialPreset({ recipeId: preset.recipeId, goal: preset.goal, inputPath: preset.inputPath })
    setView('home')
  }

  const useAgentAsTask = (agent: AgentView): void => {
    setSelectedTaskId(null)
    setInitialPreset({
      agentId: agent.id,
      ...(agent.defaultRecipeId ? { recipeId: agent.defaultRecipeId } : {}),
      ...(agent.defaultBudgetUsd !== null ? { budgetUsd: agent.defaultBudgetUsd } : {})
    })
    setView('home')
  }

  const openInspector = (taskId: string, stepId?: string): void => {
    setSelectedTaskId(taskId)
    setInspectorStepId(stepId ?? null)
    setView('inspector')
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const commands = useMemo<PaletteCommand[]>(() => {
    const navigateCommands = NAV_ITEMS.map((item) => ({
      id: `nav-${item.id}`,
      label: `切换到 ${item.label}`,
      keywords: ['页面', item.label],
      run: () => navigate(item.id)
    }))
    const taskCommands = list.map((task) => ({
      id: `task-${task.id}`,
      label: `任务 · ${task.goal}`,
      keywords: [task.userStatus, task.projectName ?? ''],
      hint: task.userStatus,
      run: () => openTask(task.id)
    }))
    const deliverableCommands = list.flatMap((task) => task.artifacts
      .filter((artifact) => artifact.isDeliverable)
      .map((artifact) => ({
        id: `artifact-${artifact.id}`,
        label: `交付物 · ${artifact.title}`,
        keywords: [task.goal, `v${artifact.version}`],
        hint: `v${artifact.version}`,
        run: () => openTask(task.id)
      })))
    return [
      {
        id: 'new-task',
        label: '发起任务',
        keywords: ['新任务', 'new task', 'Home'],
        hint: 'Home',
        run: () => {
          navigate('home')
          window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.input-card textarea')?.focus(), 0)
        }
      },
      ...navigateCommands,
      ...taskCommands,
      ...deliverableCommands
    ]
  }, [list])

  let content: React.JSX.Element
  if (view === 'task' && current) {
    content = (
      <TaskWorkspace task={current} onBack={() => navigate('home')} onOpenInspector={openInspector} />
    )
  } else if (view === 'inspector') {
    content = (
      <RunInspector
        taskId={selectedTaskId}
        tasks={list}
        onSelectTask={(id) => { setSelectedTaskId(id); setInspectorStepId(null) }}
        onBackToTask={openTask}
        initialStepId={inspectorStepId}
      />
    )
  } else if (view === 'tasks') {
    content = <Tasks tasks={list} initialFilter={initialTasksFilter} onOpenTask={openTask} />
  } else if (view === 'projects') {
    content = <Projects tasks={list} onOpenTask={openTask} />
  } else if (view === 'agents') {
    content = <Agents onUseAgent={useAgentAsTask} />
  } else if (view === 'deliverables') {
    content = <Deliverables onOpenTask={openTask} />
  } else if (view === 'library') {
    content = <Library onUseRecipe={useRecipeAsTask} onUsePreset={usePresetAsTask} />
  } else if (view === 'runtime') {
    content = (
      <RuntimeCenter
        overview={runtimeOverview}
        loading={runtimeLoading}
        error={runtimeError}
        onRefresh={refreshRuntimeOverview}
        onOpenSettings={openSettings}
      />
    )
  } else if (view === 'needYou') {
    content = (
      <NeedYou
        items={needYouItems}
        loading={needYouLoading}
        error={needYouError}
        onRefresh={refreshNeedYou}
        onOpenTask={openTask}
      />
    )
  } else if (view === 'settings') {
    content = (
      <Settings
        initialSection={settingsSection}
        onBack={() => navigate(settingsSection ? 'runtime' : 'home')}
      />
    )
  } else {
    content = (
      <Home
        tasks={list}
        needYouItems={needYouItems}
        needYouLoading={needYouLoading}
        needYouError={needYouError}
        onRefreshNeedYou={refreshNeedYou}
        onOpen={openTask}
        initialPreset={initialPreset}
        onViewAllNeedYou={() => navigate('needYou')}
        onViewAllDelivered={() => openTasksFiltered('Delivered')}
      />
    )
  }

  const activeNav = view === 'task' ? 'home' : view === 'inspector' ? '' : view
  const runningCount = list.filter((task) => ['Planning', 'Running', 'Verifying'].includes(task.userStatus)).length
  const deliveredCount = list.filter((task) => task.userStatus === 'Delivered').length
  const runtimeOverall = runtimeOverview?.overall
  const runtimeLabel = runtimeOverall ? runtimeOverallLabel(runtimeOverall) : '检查中'

  const navCount = (id: ViewId): number | null => {
    if (id === 'tasks') return list.length
    if (id === 'needYou') return needYouItems.length
    if (id === 'deliverables') return deliveredCount
    return null
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-drag" />
        <div className="sidebar-brand">
          <img src={appIconUrl} alt="" />
          <div>
            <strong>LeanClaw</strong>
            <span>本地执行工作台</span>
          </div>
        </div>
        <div className="sidebar-quick">
          <button className="sidebar-search command-trigger" onClick={() => setPaletteOpen(true)}>
            <span>搜索或跳转</span><kbd>⌘K</kbd>
          </button>
          <button
            aria-label="Home"
            className={`sidebar-create ${activeNav === 'home' ? 'active' : ''}`}
            onClick={() => navigate('home')}
          >
            <span>发起任务</span><kbd>N</kbd>
          </button>
        </div>
        <div className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="sidebar-group" key={group.id}>
              <div className="sidebar-group-label">{group.label}</div>
              {NAV_ITEMS.filter((item) => item.group === group.id && item.id !== 'home').map((item) => {
                const count = navCount(item.id)
                return (
                  <button
                    key={item.id}
                    aria-label={item.id === 'runtime' ? item.label : undefined}
                    className={`sidebar-item ${activeNav === item.id ? 'active' : ''}`}
                    onClick={() => navigate(item.id)}
                  >
                    <span>{item.title}</span>
                    <span className="visually-hidden">{item.label}</span>
                    {count !== null && <span className="sidebar-count">{count}</span>}
                  </button>
                )
              })}
              {group.id === 'system' && (
                <button
                  className={`sidebar-item ${view === 'inspector' ? 'active' : ''}`}
                  onClick={() => navigate('inspector')}
                >
                  <span>运行检查</span>
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="sidebar-footer"
          aria-label={`运行时状态：${runtimeLabel}`}
          onClick={() => navigate('runtime')}
        >
          <span className={`runtime-dot ${runtimeOverall ?? 'checking'}`} />
          <div>
            <strong>{runtimeOverall === 'busy' && runtimeOverview
              ? `${runtimeOverview.runtime.activeTasks} 个任务执行中`
              : `运行时${runtimeLabel}`}</strong>
            <span>本机数据 · 隐私优先</span>
          </div>
        </button>
      </nav>
      <div className="content-area" ref={contentArea}>
        <header className="topbar">
          <h1 className="page-title" aria-label={view === 'tasks' ? 'Tasks' : undefined}>
            {PAGE_TITLES[view]}
          </h1>
          <div className="topbar-spacer" />
          {runningCount > 0 && (
            <div className="topbar-status">
              <span className="runtime-dot active" />
              {runningCount} 个任务执行中
            </div>
          )}
          <button className="topbar-command" onClick={() => setPaletteOpen(true)}>
            搜索 <kbd>⌘K</kbd>
          </button>
        </header>
        {content}
      </div>
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}
