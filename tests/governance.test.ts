import { describe, expect, it } from 'vitest'
import { normalizeSnapshotQuotaMb, summarizeEvents, selectSnapshotDeletions } from '../src/shared/governance'
import { calculateVirtualWindow } from '../src/shared/virtual-list'

describe('event archive governance', () => {
  it('preserves count, time bounds, and event type totals in the summary', () => {
    expect(summarizeEvents([
      { type: 'step-started', createdAt: '2026-01-01T00:00:01.000Z' },
      { type: 'step-done', createdAt: '2026-01-01T00:00:02.000Z' },
      { type: 'step-done', createdAt: '2026-01-01T00:00:03.000Z' }
    ])).toEqual({
      count: 3,
      firstAt: '2026-01-01T00:00:01.000Z',
      lastAt: '2026-01-01T00:00:03.000Z',
      typeCounts: { 'step-started': 1, 'step-done': 2 }
    })
  })

  it('returns a stable empty summary', () => {
    expect(summarizeEvents([])).toEqual({ count: 0, firstAt: null, lastAt: null, typeCounts: {} })
  })
})

describe('snapshot quota governance', () => {
  const files = [
    { path: '/snap/a.html', size: 40, modifiedMs: 1 },
    { path: '/snap/b.html', size: 35, modifiedMs: 2 },
    { path: '/snap/c.html', size: 30, modifiedMs: 3 }
  ]

  it('deletes oldest unreferenced snapshots until under quota', () => {
    expect(selectSnapshotDeletions(files, 60, new Set(['/snap/b.html']))).toEqual(['/snap/a.html', '/snap/c.html'])
  })

  it('never selects evidence-referenced snapshots even when quota cannot be met', () => {
    expect(selectSnapshotDeletions(files, 1, new Set(files.map((file) => file.path)))).toEqual([])
  })

  it('accepts whole-megabyte quotas only inside the supported range', () => {
    expect(normalizeSnapshotQuotaMb(512)).toBe(512)
    expect(normalizeSnapshotQuotaMb(9)).toBeNull()
    expect(normalizeSnapshotQuotaMb(10001)).toBeNull()
    expect(normalizeSnapshotQuotaMb(Number.NaN)).toBeNull()
  })
})

describe('large task list windowing', () => {
  it('renders a buffered slice and spacer sizes for 100+ rows', () => {
    expect(calculateVirtualWindow(150, 64, 320, 640, 3)).toEqual({
      start: 7,
      end: 18,
      paddingTop: 448,
      paddingBottom: 8448
    })
  })

  it('keeps short lists fully rendered', () => {
    expect(calculateVirtualWindow(8, 64, 640, 0, 3)).toEqual({ start: 0, end: 8, paddingTop: 0, paddingBottom: 0 })
  })
})
