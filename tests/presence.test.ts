import { describe, expect, it } from 'vitest'
import { completePresenceExit, nextPresenceState } from '../src/shared/presence'

describe('presence lifecycle', () => {
  it('keeps content mounted while exit animation runs', () => {
    expect(nextPresenceState({ mounted: true, exiting: false }, false)).toEqual({ mounted: true, exiting: true })
  })

  it('remounts immediately when visibility returns and unmounts only after completion', () => {
    expect(nextPresenceState({ mounted: true, exiting: true }, true)).toEqual({ mounted: true, exiting: false })
    expect(completePresenceExit({ mounted: true, exiting: true })).toEqual({ mounted: false, exiting: false })
    expect(completePresenceExit({ mounted: true, exiting: false })).toEqual({ mounted: true, exiting: false })
  })
})
