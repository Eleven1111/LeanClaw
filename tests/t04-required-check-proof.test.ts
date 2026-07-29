import { describe, expect, it } from 'vitest'

describe('T04 Required Check proof', () => {
  it('fails deterministically so GitHub must block this PR', () => {
    expect('blocked').toBe('mergeable')
  })
})
