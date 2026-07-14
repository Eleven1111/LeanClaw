import { execFile } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const DEFAULT_LOG_MAX_BYTES = 1024 * 1024
export const DEFAULT_LOG_HISTORY = 3

export interface DiagnosticEvent {
  timestamp?: string
  process: 'main' | 'runtime'
  level: 'info' | 'error'
  event: string
  code?: string | number
  error?: unknown
}

export interface DiagnosticManifestInput {
  createdAt: string
  appVersion: string
  platform: string
  arch: string
  packaged: boolean
  versions: {
    electron: string
    node: string
    chrome: string
  }
}

export type DiagnosticManifest = DiagnosticManifestInput & { formatVersion: 1 }

function safeToken(value: string, fallback: string): string {
  const token = value.slice(0, 80)
  return /^[a-z0-9._:-]+$/i.test(token) ? token : fallback
}

function redactPrivateFrame(frame: string, privateRoots: readonly string[]): string {
  let safe = frame.slice(0, 500)
  for (const root of privateRoots.filter(Boolean)) {
    const rootIndex = safe.indexOf(root)
    if (rootIndex < 0) continue
    const location = safe.match(/:(\d+):(\d+)\)?$/)
    const closing = safe.endsWith(')') ? ')' : ''
    safe = `${safe.slice(0, rootIndex)}<private>${location ? `:${location[1]}:${location[2]}` : ''}${closing}`
  }
  return safe
}

function safeError(error: unknown, privateRoots: readonly string[]): { name: string; frames: string[] } {
  if (!(error instanceof Error)) return { name: 'NonError', frames: [] }
  const frames = (error.stack ?? '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, 20)
    .map((line) => redactPrivateFrame(line, privateRoots))
  return { name: safeToken(error.name, 'Error'), frames }
}

export function serializeDiagnosticEvent(event: DiagnosticEvent, privateRoots: readonly string[] = []): string {
  return JSON.stringify({
    timestamp: event.timestamp ?? new Date().toISOString(),
    process: event.process,
    level: event.level,
    event: safeToken(event.event, 'unknown-event'),
    ...(event.code === undefined ? {} : {
      code: typeof event.code === 'number' ? event.code : safeToken(event.code, 'unknown')
    }),
    ...(event.error === undefined ? {} : { error: safeError(event.error, privateRoots) })
  })
}

function rotateLog(logPath: string, history: number): void {
  if (history <= 0) {
    rmSync(logPath, { force: true })
    return
  }
  for (let index = history; index >= 1; index--) {
    const source = index === 1 ? logPath : `${logPath}.${index - 1}`
    const destination = `${logPath}.${index}`
    if (!existsSync(source)) continue
    rmSync(destination, { force: true })
    renameSync(source, destination)
  }
}

export function appendDiagnosticEvent(options: DiagnosticEvent & {
  logDir: string
  maxBytes?: number
  history?: number
  privateRoots?: readonly string[]
}): void {
  const {
    logDir,
    maxBytes = DEFAULT_LOG_MAX_BYTES,
    history = DEFAULT_LOG_HISTORY,
    privateRoots = [],
    ...event
  } = options
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, `${event.process}.log`)
  const line = `${serializeDiagnosticEvent(event, privateRoots)}\n`
  const currentBytes = existsSync(logPath) ? statSync(logPath).size : 0
  if (currentBytes > 0 && currentBytes + Buffer.byteLength(line) > maxBytes) rotateLog(logPath, history)
  appendFileSync(logPath, line, 'utf8')
}

export function buildDiagnosticManifest(input: DiagnosticManifestInput): DiagnosticManifest {
  return {
    formatVersion: 1,
    createdAt: input.createdAt,
    appVersion: input.appVersion,
    platform: input.platform,
    arch: input.arch,
    packaged: input.packaged,
    versions: {
      electron: input.versions.electron,
      node: input.versions.node,
      chrome: input.versions.chrome
    }
  }
}

function isAllowlistedLog(name: string): boolean {
  return /^(main|runtime)\.log(?:\.\d+)?$/.test(name)
}

export function stageDiagnosticBundle(options: {
  logsDir: string
  targetDir: string
  manifest: DiagnosticManifest
}): string[] {
  mkdirSync(options.targetDir, { recursive: true })
  const staged: string[] = []
  if (existsSync(options.logsDir)) {
    for (const name of readdirSync(options.logsDir).filter(isAllowlistedLog).sort()) {
      copyFileSync(join(options.logsDir, name), join(options.targetDir, basename(name)))
      staged.push(name)
    }
  }
  writeFileSync(join(options.targetDir, 'system.json'), `${JSON.stringify(options.manifest, null, 2)}\n`, 'utf8')
  staged.push('system.json')
  return staged
}

export async function createDiagnosticArchive(options: {
  logsDir: string
  destination: string
  manifest: DiagnosticManifest
}): Promise<void> {
  const temporaryRoot = join(tmpdir(), `leanclaw-diagnostics-${process.pid}-${Date.now()}`)
  const sourceDir = join(temporaryRoot, 'LeanClaw Diagnostics')
  try {
    stageDiagnosticBundle({ logsDir: options.logsDir, targetDir: sourceDir, manifest: options.manifest })
    await execFileAsync('/usr/bin/ditto', [
      '-c', '-k', '--keepParent',
      '--norsrc', '--noextattr', '--noqtn', '--noacl',
      sourceDir,
      options.destination
    ])
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export function diagnosticArchiveName(date = new Date()): string {
  return `LeanClaw-Diagnostics-${date.toISOString().replace(/[:.]/g, '-')}.zip`
}
