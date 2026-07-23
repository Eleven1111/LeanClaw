import { applyInstructionSnapshots } from './instructions'

export function applyProjectInstructions(prompt: string, snapshot: string | null | undefined): string {
  return applyInstructionSnapshots(prompt, snapshot, null)
}
