import type { AgentUpsertInput } from './types'

export interface NormalizedAgentInput {
  name: string
  description: string
  instructions: string
  defaultRecipeId: string | null
  defaultBudgetUsd: number | null
  maxConcurrentRuns: number
}

export type AgentValidation =
  | { ok: true; value: NormalizedAgentInput }
  | { ok: false; detail: string }

export function validateAgentInput(input: AgentUpsertInput): AgentValidation {
  const name = input.name.trim()
  if (!name || name.length > 40) {
    return { ok: false, detail: 'Agent 名称必须为 1–40 字符' }
  }
  if (input.description.length > 240) {
    return { ok: false, detail: 'Agent 用途说明不能超过 240 字符' }
  }
  if (input.instructions.length > 10_000) {
    return { ok: false, detail: 'Agent 稳定指令不能超过 10000 字符' }
  }
  const budget = input.defaultBudgetUsd ?? null
  if (budget !== null && (!Number.isFinite(budget) || budget <= 0)) {
    return { ok: false, detail: '默认预算必须为空或正数' }
  }
  if (
    !Number.isInteger(input.maxConcurrentRuns) ||
    input.maxConcurrentRuns < 1 ||
    input.maxConcurrentRuns > 3
  ) {
    return { ok: false, detail: '最大并发必须是 1–3 的整数' }
  }
  const recipeId = input.defaultRecipeId?.trim() || null
  return {
    ok: true,
    value: {
      name,
      description: input.description,
      instructions: input.instructions,
      defaultRecipeId: recipeId,
      defaultBudgetUsd: budget,
      maxConcurrentRuns: input.maxConcurrentRuns
    }
  }
}

export function agentDeleteBlocker(references: {
  taskCount: number
  scheduleCount: number
}): string | null {
  if (references.taskCount > 0 && references.scheduleCount > 0) {
    return 'Agent 已被任务和定时计划引用，不能删除'
  }
  if (references.taskCount > 0) return 'Agent 已被任务引用，不能删除'
  if (references.scheduleCount > 0) return 'Agent 已被定时计划引用，不能删除'
  return null
}

export function agentDisableBlocker(enabledScheduleCount: number): string | null {
  return enabledScheduleCount > 0
    ? 'Agent 仍被启用中的定时计划引用，请先暂停或改绑这些自动化'
    : null
}

export function agentColorIndex(id: string, paletteSize: number): number {
  if (!Number.isInteger(paletteSize) || paletteSize < 1) {
    throw new Error('Agent 色板不能为空')
  }
  let hash = 2166136261
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % paletteSize
}
