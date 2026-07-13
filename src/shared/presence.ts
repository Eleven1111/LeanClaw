export interface PresenceState {
  mounted: boolean
  exiting: boolean
}

export function nextPresenceState(state: PresenceState, show: boolean): PresenceState {
  if (show) return { mounted: true, exiting: false }
  return state.mounted ? { mounted: true, exiting: true } : state
}

export function completePresenceExit(state: PresenceState): PresenceState {
  return state.exiting ? { mounted: false, exiting: false } : state
}
