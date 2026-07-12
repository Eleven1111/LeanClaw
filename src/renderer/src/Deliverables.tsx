import { useEffect, useState } from 'react'
import type { DeliverableView } from '../../shared/types'

export function Deliverables({
  onOpenTask
}: {
  onOpenTask: (taskId: string) => void
}): React.JSX.Element {
  const [items, setItems] = useState<DeliverableView[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    void window.api.rpc({ method: 'listDeliverables' }).then((r) => {
      setItems(r as DeliverableView[])
      setLoading(false)
    })
  }, [])

  const selected = items.find((d) => d.id === selectedId) ?? null

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Deliverables</h1>
          <p className="sub">所有任务交付的成果，按交付时间倒序。</p>
        </div>
      </div>

      {loading ? (
        <p className="muted">加载中…</p>
      ) : items.length === 0 ? (
        <p className="muted">还没有交付物。回到 Home 发起一个任务。</p>
      ) : (
        <div className="card-grid">
          {items.map((d) => (
            <button
              key={d.id}
              className={`grid-card ${selectedId === d.id ? 'active' : ''}`}
              onClick={() => setSelectedId((id) => (id === d.id ? null : d.id))}
            >
              <div className="grid-card-head">
                <strong>{d.title}</strong>
                <span className={`chip ${d.verificationStatus === 'verified' ? 'chip-green' : 'chip-orange'}`}>
                  {d.verificationStatus === 'verified' ? '✓' : '⚠'}
                </span>
              </div>
              <div className="grid-card-sub muted">{d.taskGoal}</div>
              <div className="grid-card-time muted">{new Date(d.createdAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <section className="card deliverable-preview">
          <div className="deliv-head">
            <h3>{selected.title}</h3>
            <div className="actions">
              {selected.localPath && (
                <button onClick={() => void window.api.reveal(selected.localPath as string)}>
                  在 Finder 中显示
                </button>
              )}
              <button className="primary" onClick={() => onOpenTask(selected.taskId)}>
                回到任务
              </button>
            </div>
          </div>
          <pre className="preview">{selected.contentPreview}</pre>
        </section>
      )}
    </div>
  )
}
