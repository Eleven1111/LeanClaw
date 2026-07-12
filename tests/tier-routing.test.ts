import { describe, expect, it } from 'vitest'
import { resolveTierChoice } from '../src/runtime/model'
import type { ProviderConfig, TierMap } from '../src/runtime/config'

function provider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p1',
    name: 'FakeProvider',
    kind: 'openai-compat',
    baseUrl: 'https://x',
    defaultModel: 'x-model',
    inputPricePerM: null,
    outputPricePerM: null,
    apiKey: 'sk-x',
    ...overrides
  }
}

describe('resolveTierChoice（tier 路由选择纯函数）', () => {
  it('命中 tier：providerId 有效且带 key 时返回主选与备选', () => {
    const providers = [provider()]
    const tierMap: TierMap = {
      generation: { providerId: 'p1', model: 'gen-model', fallback: { providerId: 'p1', model: 'fb-model' } }
    }
    const r = resolveTierChoice(tierMap, 'generation', providers)
    expect(r.primary).toEqual({ providerId: 'p1', model: 'gen-model' })
    expect(r.fallback).toEqual({ providerId: 'p1', model: 'fb-model' })
  })

  it('缺省 tier：tier 未定义时主备均为 null', () => {
    const providers = [provider()]
    const tierMap: TierMap = { generation: { providerId: 'p1', model: 'gen-model' } }
    expect(resolveTierChoice(tierMap, undefined, providers)).toEqual({ primary: null, fallback: null })
  })

  it('缺省 tier：tierMap 中没有该 tier 的路由时主备均为 null', () => {
    const providers = [provider()]
    const tierMap: TierMap = { planning: { providerId: 'p1', model: 'plan-model' } }
    expect(resolveTierChoice(tierMap, 'generation', providers)).toEqual({ primary: null, fallback: null })
  })

  it('providerId 失效回退默认：主选 providerId 不存在于 providers 中时 primary 为 null', () => {
    const providers = [provider({ id: 'p1' })]
    const tierMap: TierMap = { generation: { providerId: 'gone', model: 'gen-model' } }
    expect(resolveTierChoice(tierMap, 'generation', providers).primary).toBeNull()
  })

  it('providerId 失效回退默认：主选 provider 存在但无 key 时 primary 为 null', () => {
    const providers = [provider({ apiKey: null })]
    const tierMap: TierMap = { generation: { providerId: 'p1', model: 'gen-model' } }
    expect(resolveTierChoice(tierMap, 'generation', providers).primary).toBeNull()
  })

  it('mock 保留字：fallback.providerId 为 mock 时始终视为可用（即使 providers 为空）', () => {
    const tierMap: TierMap = {
      generation: { providerId: 'p1', model: 'gen-model', fallback: { providerId: 'mock', model: 'mock-local' } }
    }
    const r = resolveTierChoice(tierMap, 'generation', [])
    expect(r.primary).toBeNull()
    expect(r.fallback).toEqual({ providerId: 'mock', model: 'mock-local' })
  })

  it('mock 保留字：主选 providerId 为 mock 时同样视为可用', () => {
    const tierMap: TierMap = { generation: { providerId: 'mock', model: 'mock-local' } }
    const r = resolveTierChoice(tierMap, 'generation', [])
    expect(r.primary).toEqual({ providerId: 'mock', model: 'mock-local' })
  })
})
