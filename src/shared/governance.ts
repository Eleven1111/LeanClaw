export interface EventSummaryInput {
  type: string
  createdAt: string
}

export interface EventArchiveSummary {
  count: number
  firstAt: string | null
  lastAt: string | null
  typeCounts: Record<string, number>
}

export function summarizeEvents(events: readonly EventSummaryInput[]): EventArchiveSummary {
  const typeCounts: Record<string, number> = {}
  for (const event of events) typeCounts[event.type] = (typeCounts[event.type] ?? 0) + 1
  return {
    count: events.length,
    firstAt: events[0]?.createdAt ?? null,
    lastAt: events[events.length - 1]?.createdAt ?? null,
    typeCounts
  }
}

export interface SnapshotFileInfo {
  path: string
  size: number
  modifiedMs: number
}

export function normalizeSnapshotQuotaMb(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const normalized = Math.floor(value)
  return normalized >= 10 && normalized <= 10000 ? normalized : null
}

export function selectSnapshotDeletions(
  files: readonly SnapshotFileInfo[],
  quotaBytes: number,
  protectedPaths: ReadonlySet<string>
): string[] {
  let remaining = files.reduce((total, file) => total + Math.max(0, file.size), 0)
  if (remaining <= quotaBytes) return []
  const deletions: string[] = []
  const candidates = [...files]
    .filter((file) => !protectedPaths.has(file.path))
    .sort((left, right) => left.modifiedMs - right.modifiedMs)
  for (const file of candidates) {
    if (remaining <= quotaBytes) break
    deletions.push(file.path)
    remaining -= Math.max(0, file.size)
  }
  return deletions
}
