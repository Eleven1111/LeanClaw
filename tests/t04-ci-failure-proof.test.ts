import { describe, expect, it } from 'vitest'

describe('T04 CI failure proof', () => {
  it('fails deterministically so the remote check cannot report success', () => {
    expect('blocked').toBe('passing')
  })
})
