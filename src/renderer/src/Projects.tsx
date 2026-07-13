import { useEffect, useState } from 'react'
import type { ProjectView, TaskView } from '../../shared/types'
import { EmptyState } from './EmptyState'

const EMPTY = { name: '', description: '', savedInstructions: '' }

export function Projects({ tasks, onOpenTask }: { tasks: TaskView[]; onOpenTask: (id: string) => void }): React.JSX.Element {
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const refresh = async (): Promise<void> => setProjects(await window.api.rpc({ method: 'listProjects' }) as ProjectView[])
  useEffect(() => { void refresh() }, [])
  const selected = projects.find((project) => project.id === selectedId) ?? null
  const linkedTasks = selected ? tasks.filter((task) => task.projectId === selected.id) : []

  const begin = (project?: ProjectView): void => {
    setForm(project ? { name: project.name, description: project.description, savedInstructions: project.savedInstructions } : EMPTY)
    setSelectedId(project?.id ?? null)
    setEditing(true)
    setError('')
  }
  const save = async (): Promise<void> => {
    setError('')
    try {
      const project = await window.api.rpc({ method: 'saveProject', ...(selectedId ? { projectId: selectedId } : {}), ...form }) as ProjectView
      await refresh()
      setSelectedId(project.id)
      setEditing(false)
    } catch (e) { setError((e as Error).message) }
  }
  const remove = async (): Promise<void> => {
    if (!selected) return
    setError('')
    try {
      await window.api.rpc({ method: 'deleteProject', projectId: selected.id })
      setSelectedId(null)
      await refresh()
    } catch (e) { setError((e as Error).message) }
  }

  return <div className="home projects-page">
    <div className="home-head"><div><h1>Projects</h1><p className="sub">人工组织长期上下文；不会自动读取或推断。</p></div><button className="primary" onClick={() => begin()}>新建项目</button></div>
    {error && <div className="error">{error}</div>}
    {editing && <section className="card project-form">
      <h3>{selectedId ? '编辑项目' : '新建项目'}</h3>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="项目名称" />
      <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="项目说明" />
      <textarea rows={5} value={form.savedInstructions} onChange={(e) => setForm({ ...form, savedInstructions: e.target.value })} placeholder="Saved Instructions（创建任务时注入快照）" />
      <div className="actions"><button className="primary" disabled={!form.name.trim()} onClick={() => void save()}>保存</button><button onClick={() => setEditing(false)}>取消</button></div>
    </section>}
    <div className="project-layout">
      <div className="project-list">{projects.length === 0 ? <EmptyState title="还没有项目" detail="创建一个人工容器，为相关任务固定保存指令。" /> : projects.map((project) => <button key={project.id} className={`grid-card ${selectedId === project.id ? 'active' : ''}`} onClick={() => { setSelectedId(project.id); setEditing(false) }}><strong>{project.name}</strong><span className="muted">{project.taskCount} 个任务 · {project.deliverableCount} 个交付物</span></button>)}</div>
      {selected && <section className="card project-detail"><div className="section-head"><div><h2>{selected.name}</h2><p className="muted">{selected.description || '无说明'}</p></div><div className="actions"><button onClick={() => begin(selected)}>编辑</button><button disabled={selected.taskCount > 0} onClick={() => void remove()}>删除</button></div></div><h3>Saved Instructions</h3><pre>{selected.savedInstructions || '无'}</pre><h3>关联任务</h3>{linkedTasks.length === 0 ? <p className="muted">尚无关联任务</p> : linkedTasks.map((task) => <button className="task-row" key={task.id} onClick={() => onOpenTask(task.id)}><span className="task-goal">{task.goal}</span><span>{task.userStatus}</span></button>)}</section>}
    </div>
  </div>
}
