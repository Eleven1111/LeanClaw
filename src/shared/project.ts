export function applyProjectInstructions(prompt: string, snapshot: string | null | undefined): string {
  const instructions = snapshot?.trim()
  if (!instructions) return prompt
  return `${prompt}\n\n<project_saved_instructions>\n${instructions}\n</project_saved_instructions>`
}
