export type MarkdownBlock =
  | { type: 'heading'; level: number; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] }

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isTableDivider(line: string): boolean {
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = line.match(/^\s*```([^`]*)$/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
      if (i < lines.length) i++
      blocks.push({ type: 'code', language: fence[1].trim(), content: body.join('\n') })
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2].trim() })
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const headers = tableCells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(tableCells(lines[i++]))
      blocks.push({ type: 'table', headers, rows })
      continue
    }
    const list = line.match(/^\s*(?:(\d+)\.|[-*+])\s+(.+)$/)
    if (list) {
      const ordered = Boolean(list[1])
      const items: string[] = []
      while (i < lines.length) {
        const item = lines[i].match(/^\s*(?:(\d+)\.|[-*+])\s+(.+)$/)
        if (!item || Boolean(item[1]) !== ordered) break
        items.push(item[2])
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ type: 'blockquote', content: quote.join('\n') })
      continue
    }
    const paragraph: string[] = [line.trim()]
    i++
    while (i < lines.length && lines[i].trim()) {
      if (/^(#{1,6})\s+/.test(lines[i]) || /^\s*```/.test(lines[i]) || /^\s*(?:(\d+)\.|[-*+])\s+/.test(lines[i]) || /^\s*>/.test(lines[i])) break
      if (lines[i].includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) break
      paragraph.push(lines[i].trim())
      i++
    }
    blocks.push({ type: 'paragraph', content: paragraph.join('\n') })
  }
  return blocks
}

export function safeLinkTarget(target: string): string | null {
  try {
    const url = new URL(target)
    return url.protocol === 'http:' || url.protocol === 'https:' ? target : null
  } catch {
    return null
  }
}

export function suggestedExportName(title: string, extension: 'md' | 'pdf'): string {
  const safe = title.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\.+$/g, '') || 'LeanClaw-Deliverable'
  return `${safe.replace(/\.[a-z0-9]+$/i, '')}.${extension}`
}
