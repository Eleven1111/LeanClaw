import { describe, expect, it } from 'vitest'
import { filterCommands, type SearchableCommand } from '../src/shared/command'

const commands: SearchableCommand[] = [
  { id: 'new', label: '发起任务', keywords: ['new task'] },
  { id: 'tasks', label: '切换到 Tasks', keywords: ['任务'] },
  { id: 'task-1', label: '任务 · 整理访谈', keywords: ['Delivered'] },
  { id: 'artifact-1', label: '交付物 · 访谈摘要', keywords: ['整理访谈'] }
]

describe('command palette search', () => {
  it('empty query preserves the curated command order', () => {
    expect(filterCommands(commands, '').map((command) => command.id)).toEqual(commands.map((command) => command.id))
  })

  it('matches labels and keywords case-insensitively', () => {
    expect(filterCommands(commands, 'tasks').map((command) => command.id)).toEqual(['tasks'])
    expect(filterCommands(commands, 'delivered').map((command) => command.id)).toEqual(['task-1'])
    expect(filterCommands(commands, '访谈').map((command) => command.id)).toEqual(['task-1', 'artifact-1'])
  })

  it('trims query whitespace and returns no false positives', () => {
    expect(filterCommands(commands, '  new  ').map((command) => command.id)).toEqual(['new'])
    expect(filterCommands(commands, '不存在')).toEqual([])
  })
})
