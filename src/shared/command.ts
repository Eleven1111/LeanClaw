export interface SearchableCommand {
  id: string
  label: string
  keywords: string[]
}

export function filterCommands<T extends SearchableCommand>(commands: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...commands]
  return commands.filter((command) =>
    [command.label, ...command.keywords].some((value) => value.toLocaleLowerCase().includes(needle))
  )
}
