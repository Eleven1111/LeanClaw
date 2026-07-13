import { describe, expect, it } from 'vitest'
import { actionPhrase, formatDurationReference, medianDurationMs } from '../src/shared/progress'

describe('progress projection', () => {
  it('turns a running step title into an active phrase without double prefixes', () => {
    expect(actionPhrase('读取输入文件')).toBe('正在读取输入文件…')
    expect(actionPhrase('正在抓取来源…')).toBe('正在抓取来源…')
  })

  it('uses a deterministic median and ignores invalid durations', () => {
    expect(medianDurationMs([900, 100, 500])).toBe(500)
    expect(medianDurationMs([100, 300, 200, 400])).toBe(250)
    expect(medianDurationMs([0, -1, Number.NaN])).toBeNull()
  })

  it('keeps sub-100ms references visible instead of rounding to zero', () => {
    expect(formatDurationReference(1)).toBe('<0.1s')
    expect(formatDurationReference(1250)).toBe('1.3s')
  })
})
