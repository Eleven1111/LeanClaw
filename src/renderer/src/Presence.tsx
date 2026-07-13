import { useEffect, useRef, useState, type ReactNode } from 'react'
import { completePresenceExit, nextPresenceState, type PresenceState } from '../../shared/presence'

const EXIT_FALLBACK_MS = 220

export function Presence({ show, children }: { show: boolean; children: ReactNode }): React.JSX.Element | null {
  const [state, setState] = useState<PresenceState>({ mounted: show, exiting: false })
  const retained = useRef(children)
  if (show) retained.current = children

  useEffect(() => {
    setState((current) => nextPresenceState(current, show))
  }, [show])

  useEffect(() => {
    if (!state.exiting) return
    const timer = window.setTimeout(() => setState((current) => completePresenceExit(current)), EXIT_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [state.exiting])

  if (!state.mounted) return null
  return (
    <div
      className={state.exiting ? 'presence presence-exit' : 'presence'}
      onAnimationEnd={() => setState((current) => completePresenceExit(current))}
    >
      {retained.current}
    </div>
  )
}
