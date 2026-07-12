import { describe, expect, it } from 'vitest'
import { validateProjectInput } from '../src/shared/verify'
import { applyProjectInstructions } from '../src/shared/project'

describe('validateProjectInput', () => {
  it('接受正常名称、说明与固定要求', () => {
    expect(validateProjectInput('客户研究', '长期研究项目', '使用中文，结论附来源')).toEqual({ ok: true })
  })

  it('拒绝空名称和过长字段', () => {
    expect(validateProjectInput('  ', '', '').ok).toBe(false)
    expect(validateProjectInput('x'.repeat(81), '', '').ok).toBe(false)
    expect(validateProjectInput('项目', 'x'.repeat(2001), '').ok).toBe(false)
    expect(validateProjectInput('项目', '', 'x'.repeat(4001)).ok).toBe(false)
  })
})

describe('applyProjectInstructions', () => {
  it('没有快照时保持 prompt 不变', () => {
    expect(applyProjectInstructions('原始任务', null)).toBe('原始任务')
  })

  it('以单一明确边界注入创建时快照', () => {
    const result = applyProjectInstructions('原始任务', ' 使用中文 ')
    expect(result).toContain('<project_saved_instructions>\n使用中文\n</project_saved_instructions>')
    expect(result.match(/project_saved_instructions/g)).toHaveLength(2)
  })
})
