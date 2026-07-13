import { describe, expect, it } from 'vitest'
import { defaultVersionPair, orderVersions } from '../src/shared/version'

const versions = [
  { id: 'v2', version: 2 },
  { id: 'v1', version: 1 },
  { id: 'v3', version: 3 }
]

describe('deliverable version comparison', () => {
  it('orders versions from oldest to newest without mutating input', () => {
    expect(orderVersions(versions).map((item) => item.id)).toEqual(['v1', 'v2', 'v3'])
    expect(versions.map((item) => item.id)).toEqual(['v2', 'v1', 'v3'])
  })

  it('defaults to comparing the latest version with its predecessor', () => {
    expect(defaultVersionPair(versions)).toEqual({ beforeId: 'v2', afterId: 'v3' })
  })

  it('does not offer comparison until two versions exist', () => {
    expect(defaultVersionPair([{ id: 'v1', version: 1 }])).toBeNull()
  })
})
