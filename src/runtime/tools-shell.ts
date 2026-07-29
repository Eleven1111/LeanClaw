import { spawn } from 'child_process'
import { resolve } from 'path'
import { getRuntimeConfig } from './config'
import { getWorkspaceDir } from './db'
import { ToolError, type ToolDefinition } from './tool-types'
import type { RiskLevel } from '../shared/types'
import { isPathAllowed } from './test-isolation'

const EXEC_TIMEOUT_MS = 60000
const MAX_OUTPUT_CHARS = 8192
const BASE_ENV_KEYS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'SHELL'] as const

export function matchesAllowedPrefix(command: string, prefixes: string[]): boolean {
  const trimmed = command.trim()
  return prefixes.some((p) => p.length > 0 && trimmed.startsWith(p))
}

export function riskForShell(
  command: string,
  shellEnabled: boolean,
  allowPrefixes: string[]
): RiskLevel {
  if (!shellEnabled) return 'forbidden'
  if (matchesAllowedPrefix(command, allowPrefixes)) return 'low'
  return 'approval_required'
}

export function resolveCwd(cwd: string | undefined, workspaceDir: string): string {
  if (!cwd || !cwd.trim()) return workspaceDir
  return resolve(cwd)
}

export function isCwdAllowed(
  resolvedCwd: string,
  allowedDirs: string[],
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isPathAllowed(resolvedCwd, allowedDirs, env)
}

export function buildMinimalEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of BASE_ENV_KEYS) {
    const v = source[key]
    if (typeof v === 'string') env[key] = v
  }
  return env
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + `…(${s.length} chars truncated)` : s
}

interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

function runProcess(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('/bin/sh', ['-c', command], { cwd, env })
    let stdout = ''
    let stderr = ''
    let killedByTimeout = false
    const timer = setTimeout(() => {
      killedByTimeout = true
      child.kill('SIGKILL')
    }, EXEC_TIMEOUT_MS)
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      rejectPromise(new ToolError(`子进程启动失败: ${e.message}`, true))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (killedByTimeout) {
        rejectPromise(new ToolError(`命令执行超时（${EXEC_TIMEOUT_MS}ms），已强制终止`, true))
        return
      }
      resolvePromise({ stdout: truncate(stdout), stderr: truncate(stderr), exitCode: code ?? -1 })
    })
  })
}

export const shellRunTool: ToolDefinition = {
  id: 'shell.run',
  name: '执行 Shell 命令',
  version: '1.0.0',
  provider: 'builtin',
  description: '在独立子进程中执行一条 Shell 命令；默认禁止，需用户在设置中显式开启',
  baseRisk: 'forbidden',
  riskFor(input) {
    const command = String(input.command ?? '')
    const cfg = getRuntimeConfig()
    return riskForShell(command, cfg.shellEnabled, cfg.shellAllowPrefixes)
  },
  dryRun(input) {
    const command = String(input.command ?? '')
    const cwdInput = typeof input.cwd === 'string' ? input.cwd : undefined
    const cwd = resolveCwd(cwdInput, getWorkspaceDir())
    return { summary: '将执行 Shell 命令', data: { diff: `$ ${command}\ncwd: ${cwd}` } }
  },
  async execute(input, ctx) {
    const command = String(input.command ?? '')
    if (!command.trim()) throw new ToolError('命令不能为空', false)
    const cwdInput = typeof input.cwd === 'string' ? input.cwd : undefined
    const cwd = resolveCwd(cwdInput, getWorkspaceDir())
    if (!isCwdAllowed(cwd, ctx.allowedDirs)) {
      throw new ToolError(`cwd 不在允许目录内: ${cwd}`, false)
    }
    const env = buildMinimalEnv(process.env)
    const { stdout, stderr, exitCode } = await runProcess(command, cwd, env)
    if (exitCode !== 0) {
      throw new ToolError(`命令退出码非 0（code ${exitCode}）：${stderr}`, false)
    }
    return {
      summary: `退出码 0（stdout ${stdout.length} 字符）`,
      data: { stdout, stderr, exitCode }
    }
  }
}
