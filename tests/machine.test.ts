import { describe, expect, it } from 'vitest'
import { ALLOWED, canTransition, USER_STATUS_MAP } from '../src/shared/machine'
import type { InternalStatus } from '../src/shared/types'

const ALL_STATUSES = Object.keys(ALLOWED) as InternalStatus[]

describe('状态机', () => {
  it('每个内部状态都映射到唯一的用户可见状态', () => {
    for (const s of ALL_STATUSES) {
      expect(USER_STATUS_MAP[s]).toBeTruthy()
    }
    expect(Object.keys(USER_STATUS_MAP).sort()).toEqual([...ALL_STATUSES].sort())
  })

  it('delivered 只能从 verifying 进入（交付门）', () => {
    const sources = ALL_STATUSES.filter((s) => canTransition(s, 'delivered'))
    expect(sources).toEqual(['verifying'])
  })

  it('archived 是终态，没有出边', () => {
    expect(ALLOWED.archived).toEqual([])
  })

  it('增量 Run：delivered 可回到 queued，且不影响交付门入边', () => {
    expect(canTransition('delivered', 'queued')).toBe(true)
    const sources = ALL_STATUSES.filter((s) => canTransition(s, 'delivered'))
    expect(sources).toEqual(['verifying'])
  })

  it('模型不能声称完成：draft 不能直接跳到 delivered', () => {
    expect(canTransition('draft', 'delivered')).toBe(false)
    expect(canTransition('step_running', 'delivered')).toBe(false)
  })

  it('用户暂停映射为 Running（带角标），不是独立可见状态', () => {
    expect(USER_STATUS_MAP.paused_by_user).toBe('Running')
  })

  it('验证失败映射为 Blocked，并可从检查点回到 queued', () => {
    expect(USER_STATUS_MAP.verification_failed).toBe('Blocked')
    expect(canTransition('verification_failed', 'queued')).toBe(true)
  })

  it('崩溃恢复路径：step_running 可以进入 paused_by_user，再恢复为 queued', () => {
    expect(canTransition('step_running', 'paused_by_user')).toBe(true)
    expect(canTransition('paused_by_user', 'queued')).toBe(true)
  })

  it('同状态转换不合法（无自环）', () => {
    for (const s of ALL_STATUSES) {
      expect(canTransition(s, s)).toBe(false)
    }
  })
})
