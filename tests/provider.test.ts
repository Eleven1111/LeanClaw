import { describe, expect, it } from 'vitest'
import {
  normalizeBaseUrl,
  parseOpenAiCompatResponse,
  validateProvider
} from '../src/shared/verify'

describe('normalizeBaseUrl（尾斜杠归一化）', () => {
  it('去除末尾单个斜杠', () => {
    expect(normalizeBaseUrl('https://x/v1/')).toBe('https://x/v1')
  })

  it('去除末尾多个斜杠', () => {
    expect(normalizeBaseUrl('https://x/v1///')).toBe('https://x/v1')
  })

  it('无尾斜杠时保持不变', () => {
    expect(normalizeBaseUrl('https://x/v1')).toBe('https://x/v1')
  })

  it('trim 前后空白', () => {
    expect(normalizeBaseUrl('  https://x/v1/  ')).toBe('https://x/v1')
  })
})

describe('parseOpenAiCompatResponse（choices/usage 缺省容错）', () => {
  it('解析完整响应', () => {
    const r = parseOpenAiCompatResponse({
      choices: [{ message: { content: '你好' } }],
      usage: { prompt_tokens: 12, completion_tokens: 5 }
    })
    expect(r).toEqual({ text: '你好', tokensIn: 12, tokensOut: 5 })
  })

  it('缺少 usage 时 token 归零', () => {
    const r = parseOpenAiCompatResponse({ choices: [{ message: { content: 'OK' } }] })
    expect(r).toEqual({ text: 'OK', tokensIn: 0, tokensOut: 0 })
  })

  it('缺少 choices 时文本为空', () => {
    expect(parseOpenAiCompatResponse({}).text).toBe('')
  })

  it('content 非字符串时归一为空串', () => {
    const r = parseOpenAiCompatResponse({ choices: [{ message: { content: null } }] })
    expect(r.text).toBe('')
  })

  it('null/undefined 输入不抛错', () => {
    expect(parseOpenAiCompatResponse(null)).toEqual({ text: '', tokensIn: 0, tokensOut: 0 })
    expect(parseOpenAiCompatResponse(undefined)).toEqual({ text: '', tokensIn: 0, tokensOut: 0 })
  })
})

describe('validateProvider（Provider 字段校验）', () => {
  const base = {
    name: 'DeepSeek',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat'
  }

  it('合法输入通过并 trim 字段', () => {
    const r = validateProvider({ ...base, name: '  DeepSeek  ', baseUrl: ' https://api.deepseek.com ' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.name).toBe('DeepSeek')
      expect(r.value.baseUrl).toBe('https://api.deepseek.com')
      expect(r.value.inputPricePerM).toBeNull()
      expect(r.value.outputPricePerM).toBeNull()
    }
  })

  it('价格字段解析为数字', () => {
    const r = validateProvider({ ...base, inputPricePerM: 0.14, outputPricePerM: '0.28' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.inputPricePerM).toBe(0.14)
      expect(r.value.outputPricePerM).toBe(0.28)
    }
  })

  it('空名称被拒绝', () => {
    expect(validateProvider({ ...base, name: '   ' }).ok).toBe(false)
  })

  it('名称超过 40 字符被拒绝', () => {
    expect(validateProvider({ ...base, name: 'a'.repeat(41) }).ok).toBe(false)
  })

  it('未知 kind 被拒绝', () => {
    expect(validateProvider({ ...base, kind: 'ollama' }).ok).toBe(false)
  })

  it('baseUrl 缺少 http(s) 前缀被拒绝', () => {
    expect(validateProvider({ ...base, baseUrl: 'api.deepseek.com' }).ok).toBe(false)
    expect(validateProvider({ ...base, baseUrl: 'ftp://x' }).ok).toBe(false)
  })

  it('空 defaultModel 被拒绝', () => {
    expect(validateProvider({ ...base, defaultModel: '' }).ok).toBe(false)
  })

  it('defaultModel 超过 128 字符被拒绝', () => {
    expect(validateProvider({ ...base, defaultModel: 'm'.repeat(129) }).ok).toBe(false)
  })

  it('负价格被拒绝', () => {
    expect(validateProvider({ ...base, inputPricePerM: -1 }).ok).toBe(false)
  })

  it('anthropic kind 合法', () => {
    expect(validateProvider({ ...base, kind: 'anthropic' }).ok).toBe(true)
  })
})
