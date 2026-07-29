import { describe, expect, it } from 'vitest'
import {
  buildMinimalEnv,
  isCwdAllowed,
  matchesAllowedPrefix,
  resolveCwd,
  riskForShell
} from '../src/runtime/tools-shell'

describe('matchesAllowedPrefix（白名单前缀匹配）', () => {
  it('命令以白名单前缀开头则匹配', () => {
    expect(matchesAllowedPrefix('npm test', ['npm test'])).toBe(true)
  })

  it('前缀含尾随空格时按语义匹配（避免 npm testify 之类误匹配）', () => {
    expect(matchesAllowedPrefix('npm test', ['npm test '])).toBe(false)
    expect(matchesAllowedPrefix('npm test -- --watch', ['npm test '])).toBe(true)
    expect(matchesAllowedPrefix('echo hi', ['echo '])).toBe(true)
    expect(matchesAllowedPrefix('echosomething', ['echo '])).toBe(false)
  })

  it('命令前后空白先 trim 再比较', () => {
    expect(matchesAllowedPrefix('  echo hi  ', ['echo '])).toBe(true)
  })

  it('空白名单时不匹配任何命令', () => {
    expect(matchesAllowedPrefix('echo hi', [])).toBe(false)
  })

  it('大小写敏感', () => {
    expect(matchesAllowedPrefix('Echo hi', ['echo '])).toBe(false)
    expect(matchesAllowedPrefix('ECHO hi', ['ECHO '])).toBe(true)
  })

  it('忽略白名单中的空字符串项（避免全匹配漏洞）', () => {
    expect(matchesAllowedPrefix('rm -rf /', ['', 'echo '])).toBe(false)
  })

  it('多条前缀命中任意一条即可', () => {
    expect(matchesAllowedPrefix('git status', ['echo ', 'git status'])).toBe(true)
  })
})

describe('riskForShell（三级风险判定）', () => {
  it('shellEnabled=false 时始终 forbidden，不看白名单', () => {
    expect(riskForShell('echo hi', false, ['echo '])).toBe('forbidden')
    expect(riskForShell('rm -rf /', false, [])).toBe('forbidden')
  })

  it('shellEnabled=true 且命中白名单前缀 → low', () => {
    expect(riskForShell('echo hi', true, ['echo '])).toBe('low')
  })

  it('shellEnabled=true 且未命中白名单 → approval_required', () => {
    expect(riskForShell('ls /', true, ['echo '])).toBe('approval_required')
  })

  it('shellEnabled=true 且白名单为空 → approval_required', () => {
    expect(riskForShell('echo hi', true, [])).toBe('approval_required')
  })
})

describe('resolveCwd（cwd 解析）', () => {
  it('未传 cwd 时使用工作区目录', () => {
    expect(resolveCwd(undefined, '/data/workspace')).toBe('/data/workspace')
    expect(resolveCwd('', '/data/workspace')).toBe('/data/workspace')
    expect(resolveCwd('   ', '/data/workspace')).toBe('/data/workspace')
  })

  it('传入 cwd 时解析为绝对路径', () => {
    expect(resolveCwd('/tmp/foo', '/data/workspace')).toBe('/tmp/foo')
  })
})

describe('isCwdAllowed（cwd 白名单校验）', () => {
  it('cwd 等于允许目录本身视为合法', () => {
    expect(isCwdAllowed('/data/workspace', ['/data/workspace'], {})).toBe(true)
  })

  it('cwd 为允许目录的子目录视为合法', () => {
    expect(isCwdAllowed('/data/workspace/sub', ['/data/workspace'], {})).toBe(true)
  })

  it('cwd 不在任何允许目录内视为非法', () => {
    expect(isCwdAllowed('/etc', ['/data/workspace'], {})).toBe(false)
  })

  it('前缀相似但非真实子目录时判定为非法（避免 /data/workspace2 误通过）', () => {
    expect(isCwdAllowed('/data/workspace2', ['/data/workspace'], {})).toBe(false)
  })

  it('测试模式把 LEANCLAW_TEST_ROOT 作为额外硬边界', () => {
    expect(
      isCwdAllowed('/tmp/real-user-project', ['/tmp'], {
        LEANCLAW_TEST_ROOT: '/tmp/leanclaw-test'
      })
    ).toBe(false)
    expect(
      isCwdAllowed('/tmp/leanclaw-test/workspace', ['/tmp'], {
        LEANCLAW_TEST_ROOT: '/tmp/leanclaw-test'
      })
    ).toBe(true)
  })
})

describe('buildMinimalEnv（精简子进程 env）', () => {
  it('只透传基础项，不透传 LEANCLAW_*/密钥类变量', () => {
    const source = {
      PATH: '/usr/bin:/bin',
      HOME: '/Users/x',
      LANG: 'zh_CN.UTF-8',
      LEANCLAW_SHELL: '1',
      LEANCLAW_DATA_DIR: '/data',
      ANTHROPIC_API_KEY: 'sk-secret',
      SOME_OTHER_VAR: 'value'
    }
    const env = buildMinimalEnv(source)
    expect(env.PATH).toBe('/usr/bin:/bin')
    expect(env.HOME).toBe('/Users/x')
    expect(env.LANG).toBe('zh_CN.UTF-8')
    expect(env.LEANCLAW_SHELL).toBeUndefined()
    expect(env.LEANCLAW_DATA_DIR).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.SOME_OTHER_VAR).toBeUndefined()
  })

  it('缺失的基础项不会出现在结果中', () => {
    const env = buildMinimalEnv({ PATH: '/usr/bin' })
    expect(env).toEqual({ PATH: '/usr/bin' })
  })

  it('空 env 返回空对象', () => {
    expect(buildMinimalEnv({})).toEqual({})
  })
})
