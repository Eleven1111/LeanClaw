import { useEffect, useMemo, useState } from 'react'
import type { DeliverableHistoryView } from '../../shared/types'
import { unifiedDiff } from '../../shared/diff'
import { defaultVersionPair, orderVersions } from '../../shared/version'
import { RichDeliverablePreview } from './RichDeliverablePreview'

export function VersionCompare({
  artifactId,
  onClose
}: {
  artifactId: string
  onClose: () => void
}): React.JSX.Element {
  const [history, setHistory] = useState<DeliverableHistoryView | null>(null)
  const [error, setError] = useState('')
  const [beforeId, setBeforeId] = useState('')
  const [afterId, setAfterId] = useState('')

  useEffect(() => {
    void window.api.rpc({ method: 'getDeliverableHistory', artifactId })
      .then((result) => {
        const next = result as DeliverableHistoryView
        const pair = defaultVersionPair(next.versions)
        setHistory(next)
        setBeforeId(pair?.beforeId ?? '')
        setAfterId(pair?.afterId ?? '')
      })
      .catch((reason: Error) => setError(reason.message))
  }, [artifactId])

  const versions = useMemo(() => orderVersions(history?.versions ?? []), [history])
  const before = versions.find((version) => version.id === beforeId)
  const after = versions.find((version) => version.id === afterId)
  const diff = before && after ? unifiedDiff(before.content, after.content, `v${before.version} → v${after.version}`) : ''

  return (
    <section className="card version-compare" aria-label="版本对比">
      <div className="deliv-head">
        <div>
          <h3>版本对比</h3>
          <p className="muted">并排查看交付内容，并核对逐行变化。</p>
        </div>
        <button onClick={onClose}>关闭</button>
      </div>
      {error ? <div className="error">{error}</div> : !history ? (
        <p className="muted">加载版本历史…</p>
      ) : versions.length < 2 ? (
        <p className="muted">至少需要两个交付版本才能对比。</p>
      ) : (
        <>
          <div className="version-selectors">
            <label>旧版本
              <select aria-label="旧版本" value={beforeId} onChange={(event) => setBeforeId(event.target.value)}>
                {versions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}
              </select>
            </label>
            <label>新版本
              <select aria-label="新版本" value={afterId} onChange={(event) => setAfterId(event.target.value)}>
                {versions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}
              </select>
            </label>
          </div>
          <div className="version-panes">
            <article className="version-pane">
              <h4>v{before?.version}</h4>
              {before && <RichDeliverablePreview content={before.content} />}
            </article>
            <article className="version-pane">
              <h4>v{after?.version}</h4>
              {after && <RichDeliverablePreview content={after.content} />}
            </article>
          </div>
          <div className="version-diff" aria-label="逐行差异">
            <h4>逐行差异</h4>
            <pre>{diff.split('\n').map((line, index) => (
              <span key={`${index}-${line}`} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : 'diff-context'}>{line}{'\n'}</span>
            ))}</pre>
          </div>
        </>
      )}
    </section>
  )
}
