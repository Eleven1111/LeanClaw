import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentView,
  RecipeView,
  ScheduleHistoryItemView,
  ScheduleView,
  TaskView
} from '../../shared/types'

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时间'

interface EditDraft {
  name: string
  goal: string
  inputPath: string
  recipeId: string
  agentId: string
  budgetUsd: string
  cadence: ScheduleView['cadence']
  timeOfDay: string
  dayOfWeek: number
}

function cadenceLabel(item: ScheduleView): string {
  if (item.cadence === 'daily') return `每天 ${item.timeOfDay}`
  if (item.cadence === 'weekdays') return `工作日 ${item.timeOfDay}`
  return `每周${DAY_NAMES[item.dayOfWeek ?? 1]} ${item.timeOfDay}`
}

function resultLabel(item: ScheduleView): string {
  // 认领已推进但没有 Task 落地时，显示上一次的结果就是假成功
  if (item.lastTriggerFailed) return '触发失败'
  if (!item.lastTaskUserStatus) return '尚无运行'
  if (item.lastTaskNeedsAttention) return '需要你处理'
  const labels: Record<string, string> = {
    Draft: '草稿',
    Planning: '规划中',
    Running: '执行中',
    'Waiting for You': '需要你处理',
    Verifying: '验证中',
    Delivered: '已交付',
    Blocked: '需要你处理',
    Cancelled: '已取消',
    Archived: '已归档'
  }
  return labels[item.lastTaskUserStatus] ?? item.lastTaskUserStatus
}

function formatDuration(value: number | null): string {
  if (value === null) return '尚未开始'
  if (value < 60_000) return `${Math.max(1, Math.round(value / 1000))} 秒`
  if (value < 3_600_000) return `${Math.round(value / 60_000)} 分钟`
  return `${(value / 3_600_000).toFixed(1)} 小时`
}

function formatTimestamp(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value))
}

function draftFrom(item: ScheduleView): EditDraft {
  return {
    name: item.name,
    goal: item.goal,
    inputPath: item.inputPath,
    recipeId: item.recipeId,
    agentId: item.agentId ?? '',
    budgetUsd: item.budgetUsd === null ? '' : String(item.budgetUsd),
    cadence: item.cadence,
    timeOfDay: item.timeOfDay,
    dayOfWeek: item.dayOfWeek ?? 1
  }
}

export function Automations({
  onOpenTask
}: {
  onOpenTask: (taskId: string) => void
}): React.JSX.Element {
  const [items, setItems] = useState<ScheduleView[]>([])
  const [agents, setAgents] = useState<AgentView[]>([])
  const [recipes, setRecipes] = useState<RecipeView[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [busyById, setBusyById] = useState<Record<string, boolean>>({})
  const [messageById, setMessageById] = useState<Record<string, string>>({})
  const [errorById, setErrorById] = useState<Record<string, string>>({})
  const [historyById, setHistoryById] = useState<Record<string, ScheduleHistoryItemView[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const expandedIdRef = useRef<string | null>(null)
  const pushVersionRef = useRef(0)
  const handledPushVersionRef = useRef(0)
  const pushRefreshRunningRef = useRef(false)

  const refresh = useCallback(async (): Promise<void> => {
    setPageError('')
    try {
      const [schedules, agentList, recipeList] = await Promise.all([
        window.api.rpc({ method: 'listSchedules' }),
        window.api.rpc({ method: 'listAgents' }),
        window.api.rpc({ method: 'listRecipes' })
      ])
      setItems(schedules as ScheduleView[])
      setAgents(agentList as AgentView[])
      setRecipes(recipeList as RecipeView[])
    } catch {
      setPageError('自动化列表加载失败，请重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async (scheduleId: string): Promise<void> => {
    try {
      const history = (await window.api.rpc({
        method: 'getScheduleHistory',
        scheduleId,
        limit: 5
      })) as ScheduleHistoryItemView[]
      setHistoryById((current) => ({ ...current, [scheduleId]: history }))
    } catch (caught) {
      setErrorById((current) => ({
        ...current,
        [scheduleId]: (caught as Error).message
      }))
    }
  }, [])

  const refreshFromPush = useCallback(async (): Promise<void> => {
    pushVersionRef.current += 1
    if (pushRefreshRunningRef.current) return
    pushRefreshRunningRef.current = true
    try {
      do {
        const targetVersion = pushVersionRef.current
        await refresh()
        const scheduleId = expandedIdRef.current
        if (scheduleId) await loadHistory(scheduleId)
        handledPushVersionRef.current = targetVersion
      } while (handledPushVersionRef.current < pushVersionRef.current)
    } finally {
      pushRefreshRunningRef.current = false
    }
  }, [loadHistory, refresh])

  useEffect(() => {
    void refresh()
    return window.api.onPush((event) => {
      if (event.type === 'task') void refreshFromPush()
    })
  }, [refresh, refreshFromPush])

  const runAction = async (
    item: ScheduleView,
    action: () => Promise<unknown>,
    successMessage = ''
  ): Promise<void> => {
    if (busyById[item.id]) return
    setBusyById((current) => ({ ...current, [item.id]: true }))
    setErrorById((current) => ({ ...current, [item.id]: '' }))
    setMessageById((current) => ({ ...current, [item.id]: '' }))
    try {
      await action()
      if (successMessage) {
        setMessageById((current) => ({ ...current, [item.id]: successMessage }))
      }
      await refresh()
      if (expandedIdRef.current === item.id) await loadHistory(item.id)
    } catch (caught) {
      setErrorById((current) => ({
        ...current,
        [item.id]: (caught as Error).message || '操作失败，请重试。'
      }))
    } finally {
      setBusyById((current) => ({ ...current, [item.id]: false }))
    }
  }

  const trigger = async (item: ScheduleView): Promise<void> => {
    await runAction(
      item,
      async () => {
        const task = (await window.api.rpc({
          method: 'triggerScheduleNow',
          scheduleId: item.id
        })) as TaskView
        setMessageById((current) => ({
          ...current,
          [item.id]: `已创建任务 ${task.id.slice(0, 8)}`
        }))
        await loadHistory(item.id)
      }
    )
  }

  const toggleHistory = async (item: ScheduleView): Promise<void> => {
    const next = expandedId === item.id ? null : item.id
    expandedIdRef.current = next
    setExpandedId(next)
    if (next) await loadHistory(item.id)
  }

  const clearDeletedAutomation = (scheduleId: string): void => {
    if (expandedIdRef.current === scheduleId) {
      expandedIdRef.current = null
      setExpandedId(null)
    }
    setHistoryById((current) => {
      const next = { ...current }
      delete next[scheduleId]
      return next
    })
  }

  const saveEdit = async (item: ScheduleView): Promise<void> => {
    if (!editDraft) return
    const budget = editDraft.budgetUsd.trim() ? Number(editDraft.budgetUsd) : undefined
    await runAction(item, () => window.api.rpc({
      method: 'saveSchedule',
      scheduleId: item.id,
      name: editDraft.name,
      goal: editDraft.goal,
      inputPath: editDraft.inputPath,
      recipeId: editDraft.recipeId,
      cadence: editDraft.cadence,
      timeOfDay: editDraft.timeOfDay,
      ...(editDraft.cadence === 'weekly' ? { dayOfWeek: editDraft.dayOfWeek } : {}),
      ...(item.projectId ? { projectId: item.projectId } : {}),
      ...(editDraft.agentId ? { agentId: editDraft.agentId } : {}),
      ...(budget !== undefined ? { budgetUsd: budget } : {})
    }))
    setEditId(null)
    setEditDraft(null)
  }

  const beginEdit = async (item: ScheduleView): Promise<void> => {
    setErrorById((current) => ({ ...current, [item.id]: '' }))
    try {
      const [agentList, recipeList] = await Promise.all([
        window.api.rpc({ method: 'listAgents' }),
        window.api.rpc({ method: 'listRecipes' })
      ])
      setAgents(agentList as AgentView[])
      setRecipes(recipeList as RecipeView[])
      setEditId(item.id)
      setEditDraft(draftFrom(item))
    } catch (caught) {
      setErrorById((current) => ({
        ...current,
        [item.id]: (caught as Error).message || '编辑数据加载失败。'
      }))
    }
  }

  return (
    <main className="home automations-page" aria-busy={loading}>
      <div className="automation-page-head">
        <div>
          <span className="automation-eyebrow">LOCAL SCHEDULES</span>
          <h1>自动化</h1>
          <p className="sub">按计划或手动创建普通 Task，继续遵守 WIP、预算、批准与验证。</p>
        </div>
        <div className="automation-count" aria-label={`${items.length} 个自动化`}>
          <strong>{items.length}</strong><span>自动化</span>
        </div>
      </div>

      {pageError && (
        <div className="automation-page-error" role="alert">
          <span>{pageError}</span>
          <button onClick={() => void refresh()}>重新加载</button>
        </div>
      )}

      {!loading && items.length === 0 && !pageError && (
        <div className="automation-empty">
          <span className="automation-empty-mark" aria-hidden="true"><i /><i /></span>
          <div>
            <strong>还没有自动化</strong>
            <p>回到 Home 配好一个任务，然后选择“保存为自动化”。</p>
          </div>
        </div>
      )}

      <div className="automation-list">
        {items.map((item) => {
          const busy = busyById[item.id] ?? false
          const editing = editId === item.id && editDraft
          const history = historyById[item.id] ?? []
          return (
            <article className={`automation-card ${item.enabled ? 'enabled' : 'paused'}`} key={item.id}>
              <div className="automation-card-head">
                <div className="automation-title">
                  <span className={`automation-state ${item.enabled ? 'enabled' : 'paused'}`}>
                    {item.enabled ? '已启用' : '已暂停'}
                  </span>
                  <div>
                    <h2>{item.name}</h2>
                    <p>{item.goal}</p>
                  </div>
                </div>
                <div className="automation-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void trigger(item)}
                  >
                    {busy ? '处理中…' : '立即运行'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void runAction(
                      item,
                      () => window.api.rpc({
                        method: 'setScheduleEnabled',
                        scheduleId: item.id,
                        enabled: !item.enabled
                      })
                    )}
                  >
                    {item.enabled ? '暂停' : '启用'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void beginEdit(item)}
                  >
                    编辑
                  </button>
                  <button
                    className="ghost"
                    disabled={busy}
                    onClick={() => void runAction(item, async () => {
                      await window.api.rpc({ method: 'deleteSchedule', scheduleId: item.id })
                      clearDeletedAutomation(item.id)
                    })}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="automation-facts">
                <div><span>频率</span><strong>{cadenceLabel(item)}</strong><small>{LOCAL_TIME_ZONE}</small></div>
                <div><span>执行者</span><strong>{item.agentName ?? '默认执行器'}</strong><small>{item.recipeTitle}</small></div>
                <div><span>下次运行</span><strong>{item.enabled ? formatTimestamp(item.nextRunAt) : '暂停中'}</strong><small>不会补跑错过的时段</small></div>
                <div
                  className={
                    item.lastTaskNeedsAttention || item.lastTriggerFailed ? 'attention' : ''
                  }
                >
                  <span>最近结果</span>
                  <strong>{resultLabel(item)}</strong>
                  <small>
                    {item.lastTriggerFailed
                      ? `定时 · ${formatTimestamp(item.lastTriggeredAt ?? '')} · 未创建任务，原因见诊断`
                      : item.lastTaskCreatedAt
                        ? `${item.lastTriggerSource === 'manual' ? '手动' : '定时'} · ${formatTimestamp(item.lastTaskCreatedAt)}`
                        : '运行后在此显示'}
                  </small>
                </div>
              </div>

              {editing && (
                <div className="automation-edit">
                  <div className="automation-edit-grid">
                    <label>
                      <span>名称</span>
                      <input
                        aria-label="自动化名称"
                        value={editing.name}
                        onChange={(event) => setEditDraft({ ...editing, name: event.target.value })}
                      />
                    </label>
                    <label className="wide">
                      <span>任务目标</span>
                      <input
                        aria-label="自动化任务目标"
                        value={editing.goal}
                        onChange={(event) => setEditDraft({ ...editing, goal: event.target.value })}
                      />
                    </label>
                    <label className="wide">
                      <span>输入路径</span>
                      <input
                        aria-label="自动化输入路径"
                        value={editing.inputPath}
                        onChange={(event) => setEditDraft({ ...editing, inputPath: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Recipe</span>
                      <select
                        aria-label="自动化 Recipe"
                        value={editing.recipeId}
                        onChange={(event) => setEditDraft({ ...editing, recipeId: event.target.value })}
                      >
                        {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Agent</span>
                      <select
                        aria-label="自动化 Agent"
                        value={editing.agentId}
                        onChange={(event) => setEditDraft({ ...editing, agentId: event.target.value })}
                      >
                        <option value="">默认执行器</option>
                        {agents
                          .filter((agent) => agent.enabled || agent.id === editing.agentId)
                          .map((agent) => (
                            <option key={agent.id} value={agent.id} disabled={!agent.enabled}>
                              {agent.name}{agent.enabled ? '' : '（已停用）'}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      <span>频率</span>
                      <select
                        aria-label="自动化重复频率"
                        value={editing.cadence}
                        onChange={(event) => setEditDraft({
                          ...editing,
                          cadence: event.target.value as EditDraft['cadence']
                        })}
                      >
                        <option value="daily">每天</option>
                        <option value="weekdays">工作日</option>
                        <option value="weekly">每周</option>
                      </select>
                    </label>
                    {editing.cadence === 'weekly' && (
                      <label>
                        <span>星期</span>
                        <select
                          aria-label="自动化星期"
                          value={editing.dayOfWeek}
                          onChange={(event) => setEditDraft({
                            ...editing,
                            dayOfWeek: Number(event.target.value)
                          })}
                        >
                          {DAY_NAMES.map((day, index) => <option key={day} value={index}>{day}</option>)}
                        </select>
                      </label>
                    )}
                    <label>
                      <span>时间</span>
                      <input
                        aria-label="自动化执行时间"
                        type="time"
                        value={editing.timeOfDay}
                        onChange={(event) => setEditDraft({ ...editing, timeOfDay: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>总预算 USD</span>
                      <input
                        aria-label="自动化预算 USD"
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={editing.budgetUsd}
                        onChange={(event) => setEditDraft({ ...editing, budgetUsd: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <button className="primary" disabled={busy} onClick={() => void saveEdit(item)}>
                      保存修改
                    </button>
                    <button onClick={() => { setEditId(null); setEditDraft(null) }}>取消</button>
                  </div>
                </div>
              )}

              <div className="automation-card-foot">
                <button className="automation-history-toggle" onClick={() => void toggleHistory(item)}>
                  最近运行 <span>{expandedId === item.id ? '收起' : '最近 5 次'} </span>
                </button>
                {messageById[item.id] && <span role="status">{messageById[item.id]}</span>}
                {errorById[item.id] && <span className="error" role="alert">{errorById[item.id]}</span>}
              </div>

              {expandedId === item.id && (
                <div className="automation-history">
                  {history.length === 0 ? (
                    <div className="automation-history-empty">还没有运行记录。</div>
                  ) : history.map((entry) => (
                    <button
                      className="automation-history-row"
                      key={entry.taskId}
                      onClick={() => onOpenTask(entry.taskId)}
                    >
                      <div>
                        <strong>{entry.taskGoal}</strong>
                        <span>{entry.triggerSource === 'manual' ? '手动' : '定时'} · {formatTimestamp(entry.createdAt)}</span>
                      </div>
                      <div className="automation-history-metrics">
                        <span>{entry.needsAttention ? '已进入 Need You' : entry.userStatus}</span>
                        <span>{formatDuration(entry.durationMs)}</span>
                        <span>${entry.costUsd.toFixed(4)}</span>
                        <span
                          className="automation-history-deliverables"
                          title={entry.deliverables.map((item) => `${item.title} v${item.version}`).join('、')}
                        >
                          {entry.deliverables.length === 0
                            ? '0 个交付物'
                            : entry.deliverables.map((item) => `${item.title} v${item.version}`).join('、')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </main>
  )
}
