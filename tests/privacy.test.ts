import { describe, expect, it } from 'vitest'
import {
  projectSafeRunEventPayload,
  redactTaskPrivatePaths
} from '../src/shared/privacy'

describe('Renderer 私有路径最小披露', () => {
  it('把同目录的输入与输出绝对路径收敛为文件名', () => {
    const input = '/Users/alice/Private Client/notes.md'
    const text =
      '输入：/Users/alice/Private Client/notes.md\n' +
      '写入 /Users/alice/Private Client/notes.summary.md'

    expect(redactTaskPrivatePaths(text, input)).toBe(
      '输入：…/notes.md\n写入 …/notes.summary.md'
    )
  })

  it('支持 Windows 路径并忽略大小写差异', () => {
    const input = 'C:\\Users\\Alice\\Secret\\notes.md'
    const text = 'C:\\USERS\\ALICE\\SECRET\\notes.summary.md'

    expect(redactTaskPrivatePaths(text, input)).toBe('…\\notes.summary.md')
  })

  it('空路径、相对路径和非字符串内容保持原值', () => {
    expect(redactTaskPrivatePaths('docs/notes.md', 'docs/notes.md')).toBe('docs/notes.md')
    expect(redactTaskPrivatePaths('没有路径', '')).toBe('没有路径')
    expect(redactTaskPrivatePaths(null, '/Users/alice/notes.md')).toBeNull()
  })

  it('也收敛其他目录与含空格的绝对路径，但保留 URL', () => {
    const text =
      'cwd=/Users/alice/Library/Application Support/LeanClaw/workspace/output.md；' +
      '备份 C:\\Private Files\\backup.log；来源 https://example.com/docs/a'
    const redacted = redactTaskPrivatePaths(text, '/Users/alice/client/notes.md')

    expect(redacted).toBe(
      'cwd=…/output.md；备份 …\\backup.log；来源 https://example.com/docs/a'
    )
  })
})

describe('Run Inspector 事件载荷最小披露', () => {
  it.each([
    ['brief-edited', { brief: 'PHASE2_PRIVATE_PROMPT_SENTINEL' }],
    ['refine-requested', { instruction: 'PHASE2_PRIVATE_REFINE_SENTINEL' }],
    [
      'tool-forbidden',
      {
        toolId: 'fs.write',
        input: {
          path: 'C:\\Users\\private\\secret.md',
          content: 'PHASE2_PRIVATE_TOOL_INPUT_SENTINEL'
        }
      }
    ]
  ])('丢弃 %s 的私有正文，只保留安全元数据', (type, payload) => {
    const projected = projectSafeRunEventPayload(type, JSON.stringify(payload))
    expect(projected ?? '').not.toContain('PHASE2_PRIVATE')
    expect(projected ?? '').not.toContain('C:\\\\Users')
    if (type === 'tool-forbidden') {
      expect(projected).toBe('{"toolId":"fs.write"}')
    } else {
      expect(projected).toBeNull()
    }
  })

  it('只投影事件白名单字段并忽略畸形 JSON', () => {
    expect(
      projectSafeRunEventPayload(
        'step-error',
        JSON.stringify({
          name: 'write_output',
          attempt: 3,
          retryable: true,
          message: 'sk-private-error /Users/private/input.md'
        })
      )
    ).toBe('{"name":"write_output","attempt":3,"retryable":true}')
    expect(projectSafeRunEventPayload('step-error', '{bad json')).toBeNull()
    expect(projectSafeRunEventPayload('unknown-event', '{"secret":"x"}')).toBeNull()
  })
})
