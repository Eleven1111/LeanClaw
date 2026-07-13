import { useEffect, useState } from 'react'
import type { RunDetailView, TaskView } from '../../shared/types'
import { StatusChip, STEP_ICON } from './TaskWorkspace'

const KIND_LABEL: Record<string, string> = {
  tool: 'Tool',
  model: 'Model',
  verify: 'Verify',
  deliver: 'Deliver'
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('zh-CN', { hour12: false })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start) return '—'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  return `${((e - s) / 1000).toFixed(1)}s`
}

function truncate(s: string | null, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

function TaskPicker({
  tasks,
  onSelectTask
}: {
  tasks: TaskView[]
  onSelectTask: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Run Inspector</h1>
          <p className="sub">选择一个任务，查看其最新 Run 的完整执行链路。</p>
        </div>
      </div>
      {tasks.length === 0 ? (
        <p className="muted">还没有任务。</p>
      ) : (
        <div>
          {tasks.map((t) => (
            <button key={t.id} className="task-row" onClick={() => onSelectTask(t.id)}>
              <span className="task-goal">{t.goal}</span>
              <span className="task-progress">{new Date(t.createdAt).toLocaleString()}</span>
              <StatusChip s={t.userStatus} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RunInspector({
  taskId,
  tasks,
  onSelectTask,
  onBackToTask,
  initialStepId
}: {
  taskId: string | null
  tasks: TaskView[]
  onSelectTask: (id: string) => void
  onBackToTask: (taskId: string) => void
  initialStepId: string | null
}): React.JSX.Element {
  const [detail, setDetail] = useState<RunDetailView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)
  const [eventsExpanded, setEventsExpanded] = useState(false)

  useEffect(() => {
    setDetail(null)
    setError('')
    setExpandedStepId(null)
    setEventsExpanded(false)
    if (!taskId) return
    setLoading(true)
    window.api
      .rpc({ method: 'getRunDetail', taskId })
      .then((d) => setDetail(d as RunDetailView))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [taskId])

  useEffect(() => {
    if (!detail || !initialStepId) return
    setExpandedStepId(initialStepId)
    window.setTimeout(() => document.getElementById(`run-step-${initialStepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }, [detail, initialStepId])

  if (!taskId) {
    return <TaskPicker tasks={tasks} onSelectTask={onSelectTask} />
  }

  const task = tasks.find((t) => t.id === taskId)

  return (
    <div className="inspector-page">
      <div className="home-head">
        <div>
          <h1>Run Inspector</h1>
          <p className="sub">{task?.goal ?? taskId}</p>
        </div>
        <button className="primary" onClick={() => onBackToTask(taskId)}>
          回到任务
        </button>
      </div>

      {loading && <p className="muted">加载中…</p>}
      {error && <div className="error">{error}</div>}

      {detail && (
        <>
          <div className="inspector-meta card">
            {task && <StatusChip s={task.userStatus} />}
            <span className="muted">Recipe：{detail.recipeId}</span>
            <span className="muted">开始：{fmtDateTime(detail.startedAt)}</span>
            <span className="muted">结束：{fmtDateTime(detail.endedAt)}</span>
            <span className="muted">Run 状态：{detail.status}</span>
          </div>

          <div className="columns">
            <section className="main-col">
              <h3>Step 链路</h3>
              <ul className="run-steps">
                {detail.steps.map((s) => {
                  const expanded = expandedStepId === s.id
                  return (
                    <li id={`run-step-${s.id}`} key={s.id} className={`run-step step-${s.status}`}>
                      <button
                        className="run-step-head"
                        onClick={() => setExpandedStepId(expanded ? null : s.id)}
                      >
                        <span className="icon">{STEP_ICON[s.status] ?? '○'}</span>
                        <span className="step-title">{s.title}</span>
                        <span className="chip chip-gray kind-badge">{KIND_LABEL[s.kind] ?? s.kind}</span>
                        <span className="muted">{fmtDuration(s.startedAt, s.endedAt)}</span>
                        {s.attempt > 1 && <span className="retry">第 {s.attempt} 次尝试</span>}
                      </button>
                      {expanded && (
                        <div className="run-step-detail">
                          {s.outputSummary && <p className="muted">{s.outputSummary}</p>}

                          {s.toolCalls.length > 0 && (
                            <div className="run-subsection">
                              <h4>Tool Calls</h4>
                              <ul>
                                {s.toolCalls.map((tc) => (
                                  <li key={tc.id}>
                                    <strong>{tc.toolId}</strong>@{tc.toolVersion}{' '}
                                    <span className="muted">
                                      · {tc.riskLevel} · {tc.status} · 重试 {tc.retryCount} 次
                                    </span>
                                    {tc.error ? (
                                      <div className="error">{tc.error}</div>
                                    ) : tc.outputSummary ? (
                                      <div className="muted">{tc.outputSummary}</div>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {s.modelCalls.length > 0 && (
                            <div className="run-subsection">
                              <h4>Model Calls</h4>
                              <ul>
                                {s.modelCalls.map((mc) => (
                                  <li key={mc.id}>
                                    <strong>{mc.model}</strong>{' '}
                                    <span className="muted">
                                      · {mc.status} · {mc.tokensIn ?? 0}/{mc.tokensOut ?? 0} tokens · $
                                      {(mc.costUsd ?? 0).toFixed(4)}
                                    </span>
                                    {mc.error && <div className="error">{mc.error}</div>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {s.verifications.length > 0 && (
                            <div className="run-subsection">
                              <h4>Verifications</h4>
                              <ul>
                                {s.verifications.map((v) => (
                                  <li key={v.id} className={v.status}>
                                    {v.status === 'passed' ? '✓' : '✗'} [{v.kind}] {v.detail}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            <aside className="inspector event-ledger">
              <h3>事件账本</h3>
              {!eventsExpanded ? (
                <button className="ghost" onClick={() => setEventsExpanded(true)}>
                  {detail.events.length} 条 RunEvent [展开]
                </button>
              ) : (
                <>
                  <button className="ghost" onClick={() => setEventsExpanded(false)}>
                    [收起]
                  </button>
                  <ul className="event-list diff">
                    {detail.events.map((e) => (
                      <li key={e.seq}>
                        <span className="muted">#{e.seq}</span> {fmtTime(e.createdAt)} <strong>{e.type}</strong>
                        {e.stepId && <span className="muted"> · {e.stepId.slice(0, 8)}</span>}
                        {e.payload && <div className="event-payload">{truncate(e.payload, 120)}</div>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
