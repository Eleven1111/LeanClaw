function escapeXmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function instructionBlock(tag: string, snapshot: string | null | undefined): string | null {
  const instructions = snapshot?.trim()
  if (!instructions) return null
  return `<${tag}>\n${escapeXmlText(instructions)}\n</${tag}>`
}

export function applyInstructionSnapshots(
  prompt: string,
  projectSnapshot: string | null | undefined,
  agentSnapshot: string | null | undefined,
  taskBrief?: string | null
): string {
  const blocks = [
    instructionBlock('project_saved_instructions', projectSnapshot),
    instructionBlock('agent_instructions', agentSnapshot),
    instructionBlock('task_brief', taskBrief)
  ].filter((block): block is string => block !== null)
  if (blocks.length === 0) return prompt
  const boundary = blocks.join('\n\n')
  const goalIndex = [
    prompt.indexOf('用户目标：'),
    prompt.indexOf('研究目标：'),
    prompt.indexOf('用户目标（含平台要求）：')
  ].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  if (goalIndex === undefined) return `${prompt}\n\n${boundary}`
  return `${prompt.slice(0, goalIndex).trimEnd()}\n\n${boundary}\n\n${prompt.slice(goalIndex)}`
}
