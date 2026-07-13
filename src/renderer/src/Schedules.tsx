import { useEffect, useState } from 'react'
import type { ScheduleView } from '../../shared/types'

const DAY_NAMES = ['周日','周一','周二','周三','周四','周五','周六']

export function Schedules({ template, disabled }: {
  template: { goal: string; inputPath: string; recipeId: string; projectId?: string; budgetUsd?: number }
  disabled: boolean
}): React.JSX.Element {
  const [items, setItems] = useState<ScheduleView[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<'daily'|'weekdays'|'weekly'>('daily')
  const [timeOfDay, setTimeOfDay] = useState('08:00')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [error, setError] = useState('')
  const refresh = async (): Promise<void> => setItems(await window.api.rpc({ method: 'listSchedules' }) as ScheduleView[])
  useEffect(() => { void refresh() }, [])
  const save = async (): Promise<void> => {
    setError('')
    try {
      await window.api.rpc({ method: 'saveSchedule', name, ...template, cadence, timeOfDay,
        ...(cadence === 'weekly' ? { dayOfWeek } : {}) })
      setOpen(false); await refresh()
    } catch (e) { setError((e as Error).message) }
  }
  return <section className="schedules-section">
    <div className="section-head"><div><h2>定时任务</h2><p className="muted">到点后进入同一 WIP 队列，不绕过预算、批准或验证。</p></div><button disabled={disabled} onClick={() => { setName(template.goal.slice(0,40)); setOpen(true) }}>保存为定时任务</button></div>
    {open && <div className="card schedule-form">
      <input placeholder="计划名称" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="schedule-grid"><select aria-label="重复频率" value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)}><option value="daily">每天</option><option value="weekdays">工作日</option><option value="weekly">每周</option></select>{cadence === 'weekly' && <select aria-label="星期" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>{DAY_NAMES.map((day,index)=><option key={day} value={index}>{day}</option>)}</select>}<input aria-label="执行时间" type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} /></div>
      {error && <div className="error">{error}</div>}
      <div className="actions"><button className="primary" disabled={!name.trim()} onClick={() => void save()}>保存计划</button><button onClick={() => setOpen(false)}>取消</button></div>
    </div>}
    {items.length > 0 && <div className="schedule-list">{items.map((item) => <div className="card schedule-card" key={item.id}><div><strong>{item.name}</strong><p className="muted">{item.cadence === 'daily' ? '每天' : item.cadence === 'weekdays' ? '工作日' : `每周${DAY_NAMES[item.dayOfWeek ?? 1]}`} {item.timeOfDay} · {item.recipeTitle}</p><small className="muted">下次：{new Date(item.nextRunAt).toLocaleString()}</small></div><div className="actions"><button onClick={() => void window.api.rpc({ method:'setScheduleEnabled',scheduleId:item.id,enabled:!item.enabled }).then(refresh)}>{item.enabled?'暂停':'启用'}</button><button onClick={() => void window.api.rpc({ method:'deleteSchedule',scheduleId:item.id }).then(refresh)}>删除</button></div></div>)}</div>}
  </section>
}
