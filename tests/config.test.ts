import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_ACTIVE_TASKS, DEFAULT_MODEL, resolveConfig } from '../src/runtime/config'

describe('resolveConfig（运行时配置优先级）', () => {
  it('无 override 时回退到环境变量', () => {
    const cfg = resolveConfig('sk-env', 'claude-env', {})
    expect(cfg.apiKey).toBe('sk-env')
    expect(cfg.model).toBe('claude-env')
  })

  it('无 override 且无环境变量时 apiKey 为 null、model 取默认值', () => {
    const cfg = resolveConfig(undefined, undefined, {})
    expect(cfg.apiKey).toBeNull()
    expect(cfg.model).toBe(DEFAULT_MODEL)
  })

  it('override 覆盖环境变量的 key 与 model', () => {
    const cfg = resolveConfig('sk-env', 'claude-env', { apiKey: 'sk-new', model: 'claude-opus-4-8' })
    expect(cfg.apiKey).toBe('sk-new')
    expect(cfg.model).toBe('claude-opus-4-8')
  })

  it('清除后（override.apiKey = null）即使有环境变量也回退 Mock', () => {
    const cfg = resolveConfig('sk-env', undefined, { apiKey: null, model: 'claude-sonnet-5' })
    expect(cfg.apiKey).toBeNull()
    expect(cfg.model).toBe('claude-sonnet-5')
  })

  it('仅 override model 时保留环境变量的 key', () => {
    const cfg = resolveConfig('sk-env', 'claude-env', { model: 'claude-haiku-4-5-20251001' })
    expect(cfg.apiKey).toBe('sk-env')
    expect(cfg.model).toBe('claude-haiku-4-5-20251001')
  })
})

describe('resolveConfig（maxActiveTasks 三层优先级）', () => {
  it('无 override 且无环境变量时取默认值 3', () => {
    expect(resolveConfig(undefined, undefined, {}).maxActiveTasks).toBe(DEFAULT_MAX_ACTIVE_TASKS)
  })

  it('环境变量覆盖默认值', () => {
    expect(resolveConfig(undefined, undefined, {}, '5').maxActiveTasks).toBe(5)
  })

  it('override 覆盖环境变量', () => {
    expect(resolveConfig(undefined, undefined, { maxActiveTasks: 7 }, '5').maxActiveTasks).toBe(7)
  })

  it('非法环境变量（非数字/非正整数）回退默认值', () => {
    expect(resolveConfig(undefined, undefined, {}, 'abc').maxActiveTasks).toBe(DEFAULT_MAX_ACTIVE_TASKS)
    expect(resolveConfig(undefined, undefined, {}, '0').maxActiveTasks).toBe(DEFAULT_MAX_ACTIVE_TASKS)
    expect(resolveConfig(undefined, undefined, {}, '-1').maxActiveTasks).toBe(DEFAULT_MAX_ACTIVE_TASKS)
  })
})

describe('resolveConfig（defaultBudgetUsd）', () => {
  it('无 override 时默认为 0（不限）', () => {
    expect(resolveConfig(undefined, undefined, {}).defaultBudgetUsd).toBe(0)
  })

  it('override 设置正数预算', () => {
    expect(resolveConfig(undefined, undefined, { defaultBudgetUsd: 1.5 }).defaultBudgetUsd).toBe(1.5)
  })

  it('负数预算回退为 0', () => {
    expect(resolveConfig(undefined, undefined, { defaultBudgetUsd: -1 }).defaultBudgetUsd).toBe(0)
  })
})

describe('resolveConfig（shellEnabled / shellAllowPrefixes）', () => {
  it('无 override 且无环境变量时默认关闭且白名单为空', () => {
    const cfg = resolveConfig(undefined, undefined, {})
    expect(cfg.shellEnabled).toBe(false)
    expect(cfg.shellAllowPrefixes).toEqual([])
  })

  it('LEANCLAW_SHELL=1 环境变量开启', () => {
    const cfg = resolveConfig(undefined, undefined, {}, undefined, undefined, undefined, undefined, '1')
    expect(cfg.shellEnabled).toBe(true)
  })

  it('LEANCLAW_SHELL 非 1 时保持关闭', () => {
    const cfg = resolveConfig(undefined, undefined, {}, undefined, undefined, undefined, undefined, '0')
    expect(cfg.shellEnabled).toBe(false)
  })

  it('override.shellEnabled 覆盖环境变量（包括显式 false）', () => {
    const cfg = resolveConfig(
      undefined,
      undefined,
      { shellEnabled: false },
      undefined,
      undefined,
      undefined,
      undefined,
      '1'
    )
    expect(cfg.shellEnabled).toBe(false)
  })

  it('LEANCLAW_SHELL_ALLOW 按逗号分隔且保留尾随空格语义', () => {
    const cfg = resolveConfig(
      undefined,
      undefined,
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'echo ,npm test'
    )
    expect(cfg.shellAllowPrefixes).toEqual(['echo ', 'npm test'])
  })

  it('override.shellAllowPrefixes 覆盖环境变量', () => {
    const cfg = resolveConfig(
      undefined,
      undefined,
      { shellAllowPrefixes: ['git status'] },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'echo '
    )
    expect(cfg.shellAllowPrefixes).toEqual(['git status'])
  })
})
