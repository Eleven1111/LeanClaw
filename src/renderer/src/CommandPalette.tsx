import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, type SearchableCommand } from '../../shared/command'

export interface PaletteCommand extends SearchableCommand {
  hint?: string
  run: () => void
}

export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setActiveIndex(0), [query])

  const run = (command: PaletteCommand | undefined): void => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <div className="command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <input
          ref={inputRef}
          aria-label="搜索命令、任务和交付物"
          placeholder="搜索命令、任务和交付物…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => Math.max(index - 1, 0))
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              run(filtered[activeIndex])
            }
          }}
        />
        <div className="command-results" role="listbox">
          {filtered.length === 0 ? <p className="muted">没有匹配命令</p> : filtered.map((command, index) => (
            <button
              key={command.id}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : ''}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => run(command)}
            >
              <span>{command.label}</span>
              {command.hint && <small>{command.hint}</small>}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
