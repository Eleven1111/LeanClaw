export function EmptyState({ title, detail }: { title: string; detail: string }): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true"><span /><span /><span /></div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  )
}
