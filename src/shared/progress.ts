export function actionPhrase(title: string): string {
  const value = title.trim()
  if (value.startsWith('正在')) return value.endsWith('…') ? value : `${value}…`
  return `正在${value.replace(/[。…]+$/, '')}…`
}

export function medianDurationMs(values: readonly number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function formatDurationReference(value: number): string {
  return value < 100 ? '<0.1s' : `${(value / 1000).toFixed(1)}s`
}
