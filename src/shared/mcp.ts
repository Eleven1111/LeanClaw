import type { RiskLevel } from './types'

export const MCP_TOOL_PREFIX = 'mcp'

export function mcpToolId(serverId: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}:${serverId}:${toolName}`
}

export interface ParsedMcpToolId {
  serverId: string
  toolName: string
}

export function parseMcpToolId(id: string): ParsedMcpToolId | null {
  const parts = id.split(':')
  if (parts.length < 3 || parts[0] !== MCP_TOOL_PREFIX) return null
  const serverId = parts[1]
  const toolName = parts.slice(2).join(':')
  if (!serverId || !toolName) return null
  return { serverId, toolName }
}

export function isMcpToolId(id: string): boolean {
  return parseMcpToolId(id) !== null
}

export function resolveMcpRisk(
  overrides: Record<string, RiskLevel> | undefined,
  toolId: string
): RiskLevel {
  const r = overrides?.[toolId]
  return r === 'low' || r === 'approval_required' || r === 'forbidden' ? r : 'approval_required'
}

interface McpTextBlock {
  type: string
  text: string
}

export function extractMcpText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (c): c is McpTextBlock =>
        !!c &&
        typeof c === 'object' &&
        (c as { type?: unknown }).type === 'text' &&
        typeof (c as { text?: unknown }).text === 'string'
    )
    .map((c) => c.text)
    .join('\n')
}
