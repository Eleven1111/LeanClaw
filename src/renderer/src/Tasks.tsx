import { useEffect, useRef, useState } from 'react'
import type { InternalStatus, RpcRequest, TaskView, UserStatus } from '../../shared/types'
import { StatusChip } from './TaskWorkspace'
import { calculateVirtualWindow } from '../../shared/virtual-list'
import { actionPhrase } from '../../shared/progress'
import { EmptyState } from './EmptyState'

export type TaskFilter = 'All' | 'Running' | 'NeedYou' | 'Delivered' | 'Blocked' | 'Cancelled' | 'Archived'

type ViewMode = 'list' | 'board'

const ARCHIVE_CONFIRM_MS = 3000
const VIRTUALIZE_AFTER = 100
const VIRTUAL_ROW_HEIGHT = 64
const VIRTUAL_VIEWPORT_HEIGHT = 576

const ARCHIVABLE_STATUSES: InternalStatus[] = [
  'delivered',
  'cancelled_by_user',
  'verification_failed',
  'failed'
]

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: 'All', label: 'All' },
  { id: 'Running', label: 'Running' },
  { id: 'NeedYou', label: 'Need You' },
  { id: 'Delivered', label: 'Delivered' },
  { id: 'Blocked', label: 'Blocked' },
  { id: 'Cancelled', label: 'Cancelled' },
  { id: 'Archived', label: 'Archived' }
]

const BOARD_COLUMNS: { status: UserStatus; label: string }[] = [
  { status: 'Running', label: 'Running' },
  { status: 'Waiting for You', label: 'Waiting for You' },
  { status: 'Verifying', label: 'Verifying' },
  { status: 'Delivered', label: 'Delivered' },
  { status: 'Blocked', label: 'Blocked' }
]

function matchesFilter(t: TaskView, f: TaskFilter): boolean {
  switch (f) {
    case 'All':
      return true
    case 'Running':
      return t.userStatus === 'Running'
    case 'NeedYou':
      return t.userStatus === 'Waiting for You'
    case 'Delivered':
      return t.userStatus === 'Delivered'
    case 'Blocked':
      return t.userStatus === 'Blocked'
    case 'Cancelled':
      return t.userStatus === 'Cancelled'
    case 'Archived':
      return t.userStatus === 'Archived'
    default:
      return false
  }
}

function currentStepPhrase(t: TaskView): string {
  const runningStep = t.steps.find((s) => s.status === 'running')
  const lastDone = [...t.steps].reverse().find((s) => s.status === 'done')
  return runningStep ? actionPhrase(runningStep.title) : lastDone?.outputSummary ?? lastDone?.title ?? ''
}

function TaskListRow({
  t,
  onOpen,
  onAction
}: {
  t: TaskView
  onOpen: (id: string) => void
  onAction: (req: RpcRequest) => void
}): React.JSX.Element {
  let action: React.JSX.Element | null = null
  if (t.status === 'paused_by_user') {
    action = (
      <button onClick={() => onAction({ method: 'resumeTask', taskId: t.id })}>恢复</button>
    )
  } else if (t.userStatus === 'Running') {
    action = <button onClick={() => onAction({ method: 'pauseTask', taskId: t.id })}>暂停</button>
  } else if (ARCHIVABLE_STATUSES.includes(t.status)) {
    action = (
      <button onClick={() => onAction({ method: 'archiveTask', taskId: t.id })}>归档</button>
    )
  }

  return (
    <div className="task-row">
      <button className="task-row-main" onClick={() => onOpen(t.id)}>
        <span className="task-goal">{t.goal}</span>
        <span className="task-progress">{currentStepPhrase(t)}</span>
        {t.queuePosition !== null && <span className="queue-badge">排队中 · 第 {t.queuePosition} 位</span>}
        <StatusChip s={t.userStatus} />
      </button>
      {action && <div className="task-row-actions">{action}</div>}
    </div>
  )
}

function KanbanCard({ t, onOpen }: { t: TaskView; onOpen: (id: string) => void }): React.JSX.Element {
  return (
    <button className="grid-card kanban-card" onClick={() => onOpen(t.id)}>
      <div className="kanban-card-goal preset-goal">{t.goal}</div>
      <div className="kanban-card-step muted">{currentStepPhrase(t)}</div>
      {t.queuePosition !== null && <span className="queue-badge">第 {t.queuePosition} 位</span>}
    </button>
  )
}

function TaskRows({
  tasks,
  onOpen,
  onAction
}: {
  tasks: TaskView[]
  onOpen: (id: string) => void
  onAction: (req: RpcRequest) => void
}): React.JSX.Element {
  const [scrollTop, setScrollTop] = useState(0)
  if (tasks.length <= VIRTUALIZE_AFTER) {
    return <div className="task-rows">{tasks.map((task) => <TaskListRow key={task.id} t={task} onOpen={onOpen} onAction={onAction} />)}</div>
  }
  const virtualWindow = calculateVirtualWindow(tasks.length, VIRTUAL_ROW_HEIGHT, VIRTUAL_VIEWPORT_HEIGHT, scrollTop, 4)
  return (
    <div
      className="task-rows virtual-task-list"
      data-total-count={tasks.length}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: virtualWindow.paddingTop }} aria-hidden="true" />
      {tasks.slice(virtualWindow.start, virtualWindow.end).map((task) => <TaskListRow key={task.id} t={task} onOpen={onOpen} onAction={onAction} />)}
      <div style={{ height: virtualWindow.paddingBottom }} aria-hidden="true" />
    </div>
  )
}

export function Tasks({
  tasks,
  initialFilter,
  onOpenTask
}: {
  tasks: TaskView[]
  initialFilter?: TaskFilter
  onOpenTask: (taskId: string) => void
}): React.JSX.Element {
  const [mode, setMode] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<TaskFilter>(initialFilter ?? 'All')
  const [error, setError] = useState('')
  const [confirmArchiveAll, setConfirmArchiveAll] = useState(false)
  const archiveAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter)
      setMode('list')
    }
  }, [initialFilter])

  useEffect(() => {
    return () => {
      if (archiveAllTimer.current) clearTimeout(archiveAllTimer.current)
    }
  }, [])

  const runAction = (req: RpcRequest): void => {
    setError('')
    window.api.rpc(req).catch((e: Error) => setError(e.message))
  }

  const clearArchiveAllTimer = (): void => {
    if (archiveAllTimer.current) {
      clearTimeout(archiveAllTimer.current)
      archiveAllTimer.current = null
    }
  }

  const handleArchiveAll = (): void => {
    if (!confirmArchiveAll) {
      clearArchiveAllTimer()
      setConfirmArchiveAll(true)
      archiveAllTimer.current = setTimeout(() => setConfirmArchiveAll(false), ARCHIVE_CONFIRM_MS)
      return
    }
    clearArchiveAllTimer()
    setConfirmArchiveAll(false)
    setError('')
    window.api.rpc({ method: 'archiveAllDelivered' }).catch((e: Error) => setError(e.message))
  }

  const counts = FILTERS.reduce(
    (acc, f) => {
      acc[f.id] = tasks.filter((t) => matchesFilter(t, f.id)).length
      return acc
    },
    {} as Record<TaskFilter, number>
  )

  const filtered = tasks.filter((t) => matchesFilter(t, filter))

  return (
    <div className="tasks-page">
      <div className="home-head">
        <div>
          <h1>Tasks</h1>
          <p className="sub">全部任务的筛选列表与看板视图。</p>
        </div>
        <div className="view-toggle">
          <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>
            列表
          </button>
          <button className={mode === 'board' ? 'active' : ''} onClick={() => setMode('board')}>
            看板
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {mode === 'list' ? (
        <>
          <div className="filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`filter-chip ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label} {counts[f.id]}
              </button>
            ))}
          </div>

          {filter === 'Delivered' && counts.Delivered > 0 && (
            <div className="tasks-bulk-row">
              <button className={confirmArchiveAll ? 'danger-confirm' : ''} onClick={handleArchiveAll}>
                {confirmArchiveAll ? `确认归档 ${counts.Delivered} 个` : '全部归档'}
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState title="没有符合条件的任务" detail="切换筛选条件，或回到 Home 发起一个新任务。" />
          ) : (
            <TaskRows tasks={filtered} onOpen={onOpenTask} onAction={runAction} />
          )}
        </>
      ) : (
        <div className="kanban-board">
          {BOARD_COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.userStatus === col.status)
            return (
              <div className="kanban-column" key={col.status}>
                <div className="kanban-column-head">
                  <h3>{col.label}</h3>
                  <span className="kanban-column-count">{items.length}</span>
                </div>
                <div className="card-grid kanban-column-body">
                  {items.map((t) => (
                    <KanbanCard key={t.id} t={t} onOpen={onOpenTask} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
