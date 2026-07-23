import { useEffect, useState } from 'react'
import type { AgentView, ScheduleView } from '../../shared/types'

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

interface ScheduleTemplate {
  goal: string
  inputPath: string
  recipeId: string
  projectId?: string
  agentId?: string
  budgetUsd?: number
}

export function Schedules({
  template,
  disabled
}: {
  template: ScheduleTemplate
  disabled: boolean
}): React.JSX.Element {
  const [items, setItems] = useState<ScheduleView[]>([])
  const [agents, setAgents] = useState<AgentView[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [timeOfDay, setTimeOfDay] = useState('08:00')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [rebindId, setRebindId] = useState<string | null>(null)
  const [rebindAgentId, setRebindAgentId] = useState('')
  const [error, setError] = useState('')

  const refresh = async (): Promise<void> => {
    setItems((await window.api.rpc({ method: 'listSchedules' })) as ScheduleView[])
  }

  useEffect(() => {
    void refresh()
  }, [])

  const save = async (): Promise<void> => {
    setError('')
    try {
      await window.api.rpc({
        method: 'saveSchedule',
        name,
        ...template,
        cadence,
        timeOfDay,
        ...(cadence === 'weekly' ? { dayOfWeek } : {})
      })
      setOpen(false)
      await refresh()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  const toggle = async (item: ScheduleView): Promise<void> => {
    setError('')
    try {
      await window.api.rpc({
        method: 'setScheduleEnabled',
        scheduleId: item.id,
        enabled: !item.enabled
      })
      await refresh()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  const beginRebind = async (item: ScheduleView): Promise<void> => {
    setError('')
    try {
      setAgents((await window.api.rpc({ method: 'listAgents' })) as AgentView[])
      setRebindAgentId(item.agentId ?? '')
      setRebindId(item.id)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  const saveRebind = async (item: ScheduleView): Promise<void> => {
    setError('')
    try {
      await window.api.rpc({
        method: 'saveSchedule',
        scheduleId: item.id,
        name: item.name,
        goal: item.goal,
        inputPath: item.inputPath,
        recipeId: item.recipeId,
        cadence: item.cadence,
        timeOfDay: item.timeOfDay,
        ...(item.dayOfWeek !== null ? { dayOfWeek: item.dayOfWeek } : {}),
        ...(item.projectId ? { projectId: item.projectId } : {}),
        ...(rebindAgentId ? { agentId: rebindAgentId } : {}),
        ...(item.budgetUsd !== null ? { budgetUsd: item.budgetUsd } : {})
      })
      setRebindId(null)
      await refresh()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  const remove = async (scheduleId: string): Promise<void> => {
    setError('')
    try {
      await window.api.rpc({ method: 'deleteSchedule', scheduleId })
      await refresh()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  return (
    <section className="schedules-section">
      <div className="section-head">
        <div>
          <h2>定时任务</h2>
          <p className="muted">到点后进入同一 WIP 队列，不绕过预算、批准或验证。</p>
        </div>
        <button
          disabled={disabled}
          onClick={() => {
            setError('')
            setName(template.goal.slice(0, 40))
            setOpen(true)
          }}
        >
          保存为定时任务
        </button>
      </div>

      {open && (
        <div className="card schedule-form">
          <input placeholder="计划名称" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="schedule-grid">
            <select
              aria-label="重复频率"
              value={cadence}
              onChange={(event) => setCadence(event.target.value as typeof cadence)}
            >
              <option value="daily">每天</option>
              <option value="weekdays">工作日</option>
              <option value="weekly">每周</option>
            </select>
            {cadence === 'weekly' && (
              <select
                aria-label="星期"
                value={dayOfWeek}
                onChange={(event) => setDayOfWeek(Number(event.target.value))}
              >
                {DAY_NAMES.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            )}
            <input
              aria-label="执行时间"
              type="time"
              value={timeOfDay}
              onChange={(event) => setTimeOfDay(event.target.value)}
            />
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="actions">
            <button className="primary" disabled={!name.trim()} onClick={() => void save()}>
              保存计划
            </button>
            <button onClick={() => setOpen(false)}>取消</button>
          </div>
        </div>
      )}

      {!open && error && <div className="error" role="alert">{error}</div>}

      {items.length > 0 && (
        <div className="schedule-list">
          {items.map((item) => (
            <div className="card schedule-card" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p className="muted">
                  {item.cadence === 'daily'
                    ? '每天'
                    : item.cadence === 'weekdays'
                      ? '工作日'
                      : `每周${DAY_NAMES[item.dayOfWeek ?? 1]}`}{' '}
                  {item.timeOfDay} · {item.recipeTitle}
                  {item.agentName ? ` · Agent：${item.agentName}` : ''}
                </p>
                <small className="muted">下次：{new Date(item.nextRunAt).toLocaleString()}</small>
              </div>
              <div className="actions">
                <button onClick={() => void toggle(item)}>{item.enabled ? '暂停' : '启用'}</button>
                <button onClick={() => void beginRebind(item)}>改绑 Agent</button>
                <button onClick={() => void remove(item.id)}>删除</button>
              </div>
              {rebindId === item.id && (
                <div className="schedule-rebind">
                  <label htmlFor={`schedule-agent-${item.id}`}>执行 Agent</label>
                  <select
                    id={`schedule-agent-${item.id}`}
                    aria-label={`改绑 ${item.name} 的 Agent`}
                    value={rebindAgentId}
                    onChange={(event) => setRebindAgentId(event.target.value)}
                  >
                    <option value="">默认执行器</option>
                    {agents
                      .filter((agent) => agent.enabled || agent.id === rebindAgentId)
                      .map((agent) => (
                        <option key={agent.id} value={agent.id} disabled={!agent.enabled}>
                          {agent.name}{agent.enabled ? '' : '（已停用）'}
                        </option>
                      ))}
                  </select>
                  <div className="actions">
                    <button className="primary" onClick={() => void saveRebind(item)}>
                      保存改绑
                    </button>
                    <button onClick={() => setRebindId(null)}>取消</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
