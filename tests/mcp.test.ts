import { describe, expect, it } from 'vitest'
import {
  extractMcpText,
  isMcpToolId,
  mcpToolId,
  parseMcpToolId,
  resolveMcpRisk
} from '../src/shared/mcp'
import { validateMcpServerInput } from '../src/shared/verify'
import { resolveConfig } from '../src/runtime/config'

describe('mcpToolId / parseMcpToolId（工具 id 组装与解析）', () => {
  it('组装为 mcp:<serverId>:<toolName>', () => {
    expect(mcpToolId('srv1', 'echo')).toBe('mcp:srv1:echo')
  })

  it('解析出 serverId 与 toolName', () => {
    expect(parseMcpToolId('mcp:srv1:echo')).toEqual({ serverId: 'srv1', toolName: 'echo' })
  })

  it('工具名含冒号时保留完整名', () => {
    expect(parseMcpToolId('mcp:srv1:ns:do')).toEqual({ serverId: 'srv1', toolName: 'ns:do' })
  })

  it('非 mcp 前缀或缺段返回 null', () => {
    expect(parseMcpToolId('fs.read')).toBeNull()
    expect(parseMcpToolId('mcp:srv1')).toBeNull()
    expect(parseMcpToolId('mcp::echo')).toBeNull()
    expect(parseMcpToolId('mcp:srv1:')).toBeNull()
  })

  it('isMcpToolId 判定', () => {
    expect(isMcpToolId('mcp:a:b')).toBe(true)
    expect(isMcpToolId('fs.write')).toBe(false)
  })

  it('组装后可原样解析（往返一致）', () => {
    expect(parseMcpToolId(mcpToolId('uuid-abc', 'search'))).toEqual({
      serverId: 'uuid-abc',
      toolName: 'search'
    })
  })
})

describe('resolveMcpRisk（工具风险覆盖解析）', () => {
  it('无覆盖时默认 approval_required', () => {
    expect(resolveMcpRisk(undefined, 'mcp:a:b')).toBe('approval_required')
    expect(resolveMcpRisk({}, 'mcp:a:b')).toBe('approval_required')
  })

  it('覆盖为 low / forbidden 生效', () => {
    expect(resolveMcpRisk({ 'mcp:a:b': 'low' }, 'mcp:a:b')).toBe('low')
    expect(resolveMcpRisk({ 'mcp:a:b': 'forbidden' }, 'mcp:a:b')).toBe('forbidden')
  })

  it('非法覆盖值回退默认', () => {
    expect(resolveMcpRisk({ 'mcp:a:b': 'weird' as never }, 'mcp:a:b')).toBe('approval_required')
  })
})

describe('extractMcpText（拼接文本内容块）', () => {
  it('拼接多个 text 块', () => {
    expect(
      extractMcpText([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' }
      ])
    ).toBe('a\nb')
  })

  it('忽略非 text 块', () => {
    expect(
      extractMcpText([
        { type: 'image', data: 'x', mimeType: 'image/png' },
        { type: 'text', text: 'ok' }
      ])
    ).toBe('ok')
  })

  it('非数组或空返回空串', () => {
    expect(extractMcpText(null)).toBe('')
    expect(extractMcpText(undefined)).toBe('')
    expect(extractMcpText([])).toBe('')
  })
})

describe('validateMcpServerInput（Server 配置校验）', () => {
  const base = { name: '文件系统', command: 'npx', args: ['-y', 'server'], enabled: true }

  it('合法输入通过并 trim', () => {
    const r = validateMcpServerInput({ ...base, name: '  文件系统  ', command: '  npx  ' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.name).toBe('文件系统')
      expect(r.value.command).toBe('npx')
      expect(r.value.args).toEqual(['-y', 'server'])
      expect(r.value.enabled).toBe(true)
      expect(r.value.env).toBeUndefined()
    }
  })

  it('空名称被拒绝', () => {
    expect(validateMcpServerInput({ ...base, name: '   ' }).ok).toBe(false)
  })

  it('名称超过 40 字符被拒绝', () => {
    expect(validateMcpServerInput({ ...base, name: 'a'.repeat(41) }).ok).toBe(false)
  })

  it('空命令被拒绝', () => {
    expect(validateMcpServerInput({ ...base, command: '  ' }).ok).toBe(false)
  })

  it('args 非数组被拒绝', () => {
    expect(validateMcpServerInput({ ...base, args: 'a b' }).ok).toBe(false)
  })

  it('args 含非字符串被拒绝', () => {
    expect(validateMcpServerInput({ ...base, args: ['ok', 1] }).ok).toBe(false)
  })

  it('env 值全为字符串时通过并返回 env', () => {
    const r = validateMcpServerInput({ ...base, env: { TOKEN: 'x', PATH_HINT: '/tmp' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.env).toEqual({ TOKEN: 'x', PATH_HINT: '/tmp' })
  })

  it('env 值非字符串被拒绝', () => {
    expect(validateMcpServerInput({ ...base, env: { TOKEN: 123 } }).ok).toBe(false)
  })

  it('env 非对象被拒绝', () => {
    expect(validateMcpServerInput({ ...base, env: ['a=b'] }).ok).toBe(false)
  })

  it('enabled 默认为 true（未提供）', () => {
    const r = validateMcpServerInput({ name: 'x', command: 'c', args: [] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.enabled).toBe(true)
  })

  it('enabled=false 保留', () => {
    const r = validateMcpServerInput({ ...base, enabled: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.enabled).toBe(false)
  })
})

describe('resolveConfig（mcpServers env 回退）', () => {
  it('无 override 且无 env 时为空数组、mcpToolRisk 为空对象', () => {
    const cfg = resolveConfig(undefined, undefined, {})
    expect(cfg.mcpServers).toEqual([])
    expect(cfg.mcpToolRisk).toEqual({})
  })

  it('从 LEANCLAW_MCP_SERVERS 解析（含 env 明文）', () => {
    const env = JSON.stringify([
      { id: 'm1', name: 'Echo', command: '/bin/x', args: ['a.cjs'], enabled: true, env: { K: '1' } }
    ])
    const cfg = resolveConfig(undefined, undefined, {}, undefined, undefined, undefined, env)
    expect(cfg.mcpServers).toHaveLength(1)
    expect(cfg.mcpServers[0]).toEqual({
      id: 'm1',
      name: 'Echo',
      command: '/bin/x',
      args: ['a.cjs'],
      enabled: true,
      env: { K: '1' }
    })
  })

  it('缺少 id 或 command 的条目被过滤', () => {
    const env = JSON.stringify([
      { id: '', command: 'x' },
      { id: 'm2', command: '' },
      { id: 'm3', name: 'ok', command: 'c', args: [], enabled: false }
    ])
    const cfg = resolveConfig(undefined, undefined, {}, undefined, undefined, undefined, env)
    expect(cfg.mcpServers.map((s) => s.id)).toEqual(['m3'])
    expect(cfg.mcpServers[0].enabled).toBe(false)
  })

  it('override.mcpServers 覆盖 env', () => {
    const env = JSON.stringify([{ id: 'm1', command: 'x', args: [], enabled: true }])
    const cfg = resolveConfig(undefined, undefined, { mcpServers: [] }, undefined, undefined, undefined, env)
    expect(cfg.mcpServers).toEqual([])
  })

  it('非法 JSON 回退空数组', () => {
    const cfg = resolveConfig(undefined, undefined, {}, undefined, undefined, undefined, 'not-json')
    expect(cfg.mcpServers).toEqual([])
  })
})
