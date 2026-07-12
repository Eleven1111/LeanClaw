import { describe, expect, it } from 'vitest'
import { unifiedDiff } from '../src/shared/diff'

describe('unifiedDiff（Approval 的 Diff Preview）', () => {
  it('新建文件时所有行都是新增', () => {
    const d = unifiedDiff('', 'a\nb', 'x.md')
    expect(d).toContain('+ a')
    expect(d).toContain('+ b')
    expect(d.split('\n').some((l) => l.startsWith('- '))).toBe(false)
  })

  it('修改文件时同时含删除与新增行', () => {
    const d = unifiedDiff('a\nb\nc', 'a\nX\nc')
    expect(d).toContain('- b')
    expect(d).toContain('+ X')
    expect(d).toContain('  a')
    expect(d).toContain('  c')
  })

  it('内容相同时明确说明无变化', () => {
    expect(unifiedDiff('same', 'same')).toContain('内容无变化')
  })

  it('带 label 时输出 before/after 头', () => {
    const d = unifiedDiff('a', 'b', 'file.md')
    expect(d).toContain('--- file.md (before)')
    expect(d).toContain('+++ file.md (after)')
  })
})
