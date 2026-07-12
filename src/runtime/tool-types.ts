import type { RiskLevel } from '../shared/types'

export class ToolError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message)
  }
}

export interface ToolContext {
  allowedDirs: string[]
}

export interface ToolResult {
  summary: string
  data?: Record<string, unknown>
}

export interface ToolDefinition {
  id: string
  name: string
  version: string
  provider: 'builtin' | 'mcp' | 'cli'
  description: string
  baseRisk: RiskLevel
  riskFor(input: Record<string, unknown>, ctx: ToolContext): RiskLevel
  dryRun?(input: Record<string, unknown>): ToolResult
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}
