import { useState } from 'react'

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
  disabled,
  onViewAutomations
}: {
  template: ScheduleTemplate
  disabled: boolean
  onViewAutomations: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [timeOfDay, setTimeOfDay] = useState('08:00')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
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
      setSaved(true)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="schedules-section automation-quick-create">
      <div className="section-head">
        <div>
          <h2>自动化</h2>
          <p className="muted">保存当前任务配置；每次运行仍进入同一安全链。</p>
        </div>
        <button
          disabled={disabled}
          onClick={() => {
            setError('')
            setSaved(false)
            setName(template.goal.slice(0, 40))
            setOpen(true)
          }}
        >
          保存为自动化
        </button>
      </div>

      {open && (
        <div className="card schedule-form">
          <input
            aria-label="自动化名称"
            placeholder="自动化名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
                  <option key={day} value={index}>{day}</option>
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
            <button className="primary" disabled={busy || !name.trim()} onClick={() => void save()}>
              {busy ? '保存中…' : '保存自动化'}
            </button>
            <button disabled={busy} onClick={() => setOpen(false)}>取消</button>
          </div>
        </div>
      )}

      {!open && error && <div className="error" role="alert">{error}</div>}
      {saved && (
        <div className="automation-saved" role="status">
          <span>自动化已保存，首次运行会创建一个普通 Task。</span>
          <button className="ghost" onClick={onViewAutomations}>查看自动化</button>
        </div>
      )}
    </section>
  )
}
