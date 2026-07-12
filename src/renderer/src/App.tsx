import { useCallback, useEffect, useState } from 'react'
import type { PresetView, TaskView } from '../../shared/types'
import { Home } from './Home'
import { Settings } from './Settings'
import { TaskWorkspace } from './TaskWorkspace'
import { Deliverables } from './Deliverables'
import { Library } from './Library'
import { RunInspector } from './RunInspector'
import { Tasks } from './Tasks'
import { Projects } from './Projects'
import type { TaskFilter } from './Tasks'

type ViewId = 'home' | 'task' | 'tasks' | 'projects' | 'deliverables' | 'library' | 'settings' | 'inspector'

interface InitialPreset {
  recipeId: string
  goal?: string
  inputPath?: string
}

const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'library', label: 'Library' },
  { id: 'settings', label: 'Settings' }
]

export function App(): React.JSX.Element {
  const [tasks, setTasks] = useState<Record<string, TaskView>>({})
  const [view, setView] = useState<ViewId>('home')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [initialPreset, setInitialPreset] = useState<InitialPreset | undefined>(undefined)
  const [initialTasksFilter, setInitialTasksFilter] = useState<TaskFilter | undefined>(undefined)

  const refresh = useCallback(async () => {
    const list = (await window.api.rpc({ method: 'listTasks' })) as TaskView[]
    setTasks(Object.fromEntries(list.map((t) => [t.id, t])))
  }, [])

  useEffect(() => {
    void refresh()
    return window.api.onPush((e) => {
      if (e.type === 'task') {
        setTasks((prev) => ({ ...prev, [e.task.id]: e.task }))
      }
    })
  }, [refresh])

  const list = Object.values(tasks).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const current = selectedTaskId ? tasks[selectedTaskId] : null

  const openTask = (id: string): void => {
    setSelectedTaskId(id)
    setView('task')
  }

  const navigate = (id: ViewId): void => {
    setSelectedTaskId(null)
    setInitialPreset(undefined)
    setInitialTasksFilter(undefined)
    setView(id)
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

  const openInspector = (taskId: string): void => {
    setSelectedTaskId(taskId)
    setView('inspector')
  }

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
        onSelectTask={(id) => setSelectedTaskId(id)}
        onBackToTask={openTask}
      />
    )
  } else if (view === 'tasks') {
    content = <Tasks tasks={list} initialFilter={initialTasksFilter} onOpenTask={openTask} />
  } else if (view === 'projects') {
    content = <Projects tasks={list} onOpenTask={openTask} />
  } else if (view === 'deliverables') {
    content = <Deliverables onOpenTask={openTask} />
  } else if (view === 'library') {
    content = <Library onUseRecipe={useRecipeAsTask} onUsePreset={usePresetAsTask} />
  } else if (view === 'settings') {
    content = <Settings onBack={() => navigate('home')} />
  } else {
    content = (
      <Home
        tasks={list}
        onOpen={openTask}
        initialPreset={initialPreset}
        onViewAllDelivered={() => openTasksFiltered('Delivered')}
      />
    )
  }

  const activeNav = view === 'task' ? 'home' : view === 'inspector' ? '' : view

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-drag" />
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${activeNav === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="sidebar-nav sidebar-nav-secondary">
          <div className="sidebar-group-label">Advanced</div>
          <button
            className={`sidebar-item ${view === 'inspector' ? 'active' : ''}`}
            onClick={() => navigate('inspector')}
          >
            Run Inspector
          </button>
        </div>
      </nav>
      <div className="content-area">
        <div className="titlebar" />
        {content}
      </div>
    </div>
  )
}
