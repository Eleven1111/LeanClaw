import { execFile } from 'child_process'
import { statSync } from 'fs'

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
const MAX_TEXT_BYTES = 10 * 1024 * 1024

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

function xmlText(fragment: string): string {
  return decodeXml([...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join(''))
}

export function normalizePdfText(text: string): string {
  return text.replace(/\0/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
}

export function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1]))
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A'
  let index = 0
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64
  return index - 1
}

export function parseWorksheetXml(xml: string, shared: string[]): string {
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1]
      const body = cellMatch[2]
      const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? `A${rows.length + 1}`
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? ''
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
      let value = type === 'inlineStr' ? xmlText(body) : decodeXml(raw)
      if (type === 's') value = shared[Number(raw)] ?? ''
      row[columnIndex(ref)] = value
    }
    rows.push(row)
  }
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const clean = (value: string | undefined): string => (value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => clean(row[index])))
  return [normalized[0], Array(width).fill('---'), ...normalized.slice(1)]
    .map((row) => `| ${row.join(' | ')} |`).join('\n')
}

function runFile(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: MAX_TEXT_BYTES, timeout: 20_000, env }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

function assertDocumentSize(path: string): void {
  if (statSync(path).size > MAX_DOCUMENT_BYTES) throw new Error('文档超过 50MB 上限')
}

export async function extractPdfText(path: string): Promise<string> {
  assertDocumentSize(path)
  const script = 'ObjC.import("PDFKit");ObjC.import("stdlib");const p=ObjC.unwrap($.getenv("PDF_PATH"));const d=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(p));if(!d)throw new Error("无法打开 PDF");ObjC.unwrap(d.string);'
  const text = await runFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { PATH: '/usr/bin:/bin', PDF_PATH: path })
  return normalizePdfText(text)
}

export async function extractXlsxText(path: string): Promise<string> {
  assertDocumentSize(path)
  const entries = (await runFile('/usr/bin/unzip', ['-Z1', path])).split('\n').filter(Boolean)
  const sharedPath = entries.find((entry) => entry === 'xl/sharedStrings.xml')
  const shared = sharedPath ? parseSharedStrings(await runFile('/usr/bin/unzip', ['-p', path, sharedPath])) : []
  const sheets = entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry)).sort()
  if (sheets.length === 0) throw new Error('XLSX 中没有工作表')
  const rendered: string[] = []
  for (let index = 0; index < sheets.length; index++) {
    const table = parseWorksheetXml(await runFile('/usr/bin/unzip', ['-p', path, sheets[index]]), shared)
    rendered.push(sheets.length > 1 ? `## Sheet ${index + 1}\n\n${table}` : table)
  }
  return rendered.join('\n\n')
}
