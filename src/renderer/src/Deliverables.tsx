import { useEffect, useState } from 'react'
import type { DeliverableDetailView, DeliverableView } from '../../shared/types'
import { parseEvidenceLocator } from '../../shared/verify'
import { RichDeliverablePreview } from './RichDeliverablePreview'

export function Deliverables({
  onOpenTask
}: {
  onOpenTask: (taskId: string) => void
}): React.JSX.Element {
  const [items, setItems] = useState<DeliverableView[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DeliverableDetailView | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [exportStatus, setExportStatus] = useState('')

  useEffect(() => {
    void window.api.rpc({ method: 'listDeliverables' }).then((r) => {
      setItems(r as DeliverableView[])
      setLoading(false)
    })
  }, [])

  const selected = items.find((d) => d.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    void window.api.rpc({ method: 'getDeliverable', artifactId: selectedId })
      .then((result) => setDetail(result as DeliverableDetailView))
      .finally(() => setDetailLoading(false))
  }, [selectedId])

  const copySelected = async (): Promise<void> => {
    if (!detail) return
    await window.api.copyDeliverable(detail.id)
    setExportStatus('已复制全文')
  }

  const saveSelected = async (): Promise<void> => {
    if (!detail) return
    const result = await window.api.saveDeliverable(detail.id, detail.title)
    setExportStatus(result.cancelled ? '' : '已另存为 Markdown')
  }

  const exportPdf = async (): Promise<void> => {
    if (!detail) return
    document.body.classList.add('exporting-deliverable')
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const result = await window.api.exportDeliverablePdf(detail.title)
      setExportStatus(result.cancelled ? '' : 'PDF 已导出')
    } finally {
      document.body.classList.remove('exporting-deliverable')
    }
  }

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
              <button disabled={!detail} onClick={() => void copySelected()}>复制</button>
              <button disabled={!detail} onClick={() => void saveSelected()}>另存为</button>
              <button disabled={!detail} onClick={() => void exportPdf()}>导出 PDF</button>
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
          {exportStatus && <div className="export-status" role="status">{exportStatus}</div>}
          {detailLoading || !detail ? (
            <p className="muted">加载完整交付物…</p>
          ) : (
            <>
              <RichDeliverablePreview
                content={detail.content}
                onCitation={(index) => document.getElementById(`deliverable-evidence-${index}`)?.scrollIntoView({ behavior: 'smooth' })}
              />
              {detail.evidence.length > 0 && (
                <div className="deliverable-evidence">
                  <h3>Evidence</h3>
                  <ol>
                    {detail.evidence.map((e, index) => {
                      const { source } = parseEvidenceLocator(e.locator)
                      return <li id={`deliverable-evidence-${index + 1}`} tabIndex={-1} key={e.id}><span>{e.excerpt}</span><small>{source}</small></li>
                    })}
                  </ol>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
