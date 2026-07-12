import { createElement, type ReactNode } from 'react'
import { parseMarkdown, safeLinkTarget } from '../../shared/markdown'

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[0-9]+\]|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g

function inlineNodes(text: string, onCitation?: (index: number) => void): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    const citation = part.match(/^\[(\d+)\]$/)
    if (citation) {
      const n = Number(citation[1])
      return (
        <button key={index} className="citation" onClick={() => onCitation?.(n)} aria-label={`查看引用 ${n}`}>
          [{n}]
        </button>
      )
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const target = safeLinkTarget(link[2])
      return target ? (
        <a key={index} href="#" onClick={(event) => { event.preventDefault(); void window.api.openExternal(target) }}>
          {link[1]}
        </a>
      ) : <span key={index}>{link[1]}</span>
    }
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return part
  })
}

export function RichDeliverablePreview({
  content,
  onCitation
}: {
  content: string
  onCitation?: (index: number) => void
}): React.JSX.Element {
  const blocks = parseMarkdown(content)
  return (
    <article className="markdown-preview" data-export-root>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return createElement(`h${block.level}`, { key: index }, inlineNodes(block.content, onCitation))
        }
        if (block.type === 'paragraph') return <p key={index}>{inlineNodes(block.content, onCitation)}</p>
        if (block.type === 'blockquote') return <blockquote key={index}>{inlineNodes(block.content, onCitation)}</blockquote>
        if (block.type === 'code') return <pre key={index}><code data-language={block.language}>{block.content}</code></pre>
        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return <Tag key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineNodes(item, onCitation)}</li>)}</Tag>
        }
        return (
          <div className="markdown-table-wrap" key={index}>
            <table>
              <thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{inlineNodes(cell, onCitation)}</th>)}</tr></thead>
              <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inlineNodes(cell, onCitation)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )
      })}
    </article>
  )
}
