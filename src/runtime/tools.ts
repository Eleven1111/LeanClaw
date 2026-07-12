import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { dirname, resolve } from 'path'
import { unifiedDiff } from '../shared/diff'
import { webFetchTool, webSearchTool } from './tools-web'
import { shellRunTool } from './tools-shell'
import { ToolError, type ToolContext, type ToolDefinition, type ToolResult } from './tool-types'

export { ToolError, type ToolContext, type ToolDefinition, type ToolResult }

function inAllowedDirs(p: string, dirs: string[]): boolean {
  const rp = resolve(p)
  return dirs.some((d) => rp === resolve(d) || rp.startsWith(resolve(d) + '/'))
}

const readFileTool: ToolDefinition = {
  id: 'fs.read',
  name: '读取本地文件',
  version: '1.0.0',
  provider: 'builtin',
  description: '读取一个本地文本文件的完整内容',
  baseRisk: 'low',
  riskFor: () => 'low',
  async execute(input) {
    const path = String(input.path ?? '')
    if (!existsSync(path)) throw new ToolError(`输入文件不存在: ${path}`, false)
    const raw = readFileSync(path, 'utf8')
    const content = path.toLowerCase().endsWith('.csv') ? csvToMarkdown(raw) : raw
    return { summary: `已读取 ${path}（${content.length} 字符）`, data: { content } }
  }
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === '"') {
      if (quoted && content[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (ch === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && content[i + 1] === '\n') i++
      row.push(cell); if (row.some((value) => value.length > 0)) rows.push(row)
      row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function csvToMarkdown(content: string): string {
  const rows = parseCsv(content)
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const clean = (value: string): string => value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
  const normalized = rows.map((row) => Array.from({ length: width }, (_, i) => clean(row[i] ?? '')))
  return [normalized[0], Array(width).fill('---'), ...normalized.slice(1)]
    .map((row) => `| ${row.join(' | ')} |`).join('\n')
}

const listDirTool: ToolDefinition = {
  id: 'fs.list',
  name: '列出目录',
  version: '1.0.0',
  provider: 'builtin',
  description: '列出允许目录的一层文件与子目录，只读动作',
  baseRisk: 'low',
  riskFor(input, ctx) {
    return inAllowedDirs(String(input.path ?? ''), ctx.allowedDirs) ? 'low' : 'forbidden'
  },
  async execute(input) {
    const path = String(input.path ?? '')
    if (!existsSync(path) || !statSync(path).isDirectory()) throw new ToolError(`目录不存在: ${path}`, false)
    const entries = readdirSync(path).sort().map((name) => ({
      name,
      type: statSync(resolve(path, name)).isDirectory() ? 'directory' : 'file'
    }))
    return { summary: `已列出 ${path}（${entries.length} 项）`, data: { entries } }
  }
}

const writeFileTool: ToolDefinition = {
  id: 'fs.write',
  name: '写入本地文件',
  version: '1.0.0',
  provider: 'builtin',
  description: '将内容写入本地文件，覆盖已有内容；不可逆动作，需人工批准',
  baseRisk: 'approval_required',
  riskFor(input, ctx) {
    const path = String(input.path ?? '')
    return inAllowedDirs(path, ctx.allowedDirs) ? 'approval_required' : 'forbidden'
  },
  dryRun(input) {
    const path = String(input.path ?? '')
    const content = String(input.content ?? '')
    const before = existsSync(path) ? readFileSync(path, 'utf8') : ''
    return { summary: `将写入 ${path}`, data: { diff: unifiedDiff(before, content, path) } }
  },
  async execute(input) {
    if (process.env.LEANCLAW_FAULT === 'tool_fail') {
      throw new ToolError('模拟工具故障（LEANCLAW_FAULT=tool_fail）', true)
    }
    const path = String(input.path ?? '')
    const content = String(input.content ?? '')
    const hash = createHash('sha256').update(content).digest('hex')
    if (existsSync(path)) {
      const current = createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex')
      if (current === hash) {
        return { summary: `目标内容未变化，幂等跳过（${path}）`, data: { skipped: true, hash } }
      }
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
    return { summary: `已写入 ${path}（${content.length} 字符）`, data: { skipped: false, hash } }
  }
}

const registry = new Map<string, ToolDefinition>([
  [readFileTool.id, readFileTool],
  [listDirTool.id, listDirTool],
  [writeFileTool.id, writeFileTool],
  [webFetchTool.id, webFetchTool],
  [webSearchTool.id, webSearchTool],
  [shellRunTool.id, shellRunTool]
])

export function registerDynamicTool(tool: ToolDefinition): void {
  registry.set(tool.id, tool)
}

export function unregisterTool(id: string): void {
  registry.delete(id)
}

export function getTool(id: string): ToolDefinition {
  const tool = registry.get(id)
  if (!tool) throw new ToolError(`工具未注册: ${id}`, false)
  return tool
}

export function listTools(): ToolDefinition[] {
  return [...registry.values()]
}
