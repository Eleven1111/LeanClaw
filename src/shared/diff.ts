export function unifiedDiff(before: string, after: string, label = ''): string {
  const header = label ? `--- ${label} (before)\n+++ ${label} (after)\n` : ''
  if (before === after) return header + '(内容无变化)'
  const b = after.split('\n')
  if (before === '') return header + b.map((l) => '+ ' + l).join('\n')
  const a = before.split('\n')
  const m = a.length
  const n = b.length
  // LCS 动态规划表，用于生成最小行级差异
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push('  ' + a[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push('- ' + a[i])
      i++
    } else {
      out.push('+ ' + b[j])
      j++
    }
  }
  while (i < m) {
    out.push('- ' + a[i])
    i++
  }
  while (j < n) {
    out.push('+ ' + b[j])
    j++
  }
  return header + out.join('\n')
}
