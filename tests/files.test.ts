import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { getTool } from '../src/runtime/tools'

const roots: string[] = []
afterEach(() => { while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true }) })

describe('文件能力扩展', () => {
  it('fs.read 将 CSV 转为结构化 Markdown 表格', async () => {
    const root = mkdtempSync(join(tmpdir(), 'leanclaw-csv-')); roots.push(root)
    const path = join(root, 'data.csv')
    writeFileSync(path, 'name,note\nAlice,"a,b"\nBob,ok\n')
    const result = await getTool('fs.read').execute({ path }, { allowedDirs: [root] })
    expect(result.data?.content).toContain('| name | note |')
    expect(result.data?.content).toContain('| Alice | a,b |')
  })

  it('fs.list 只列一层并返回文件类型', async () => {
    const root = mkdtempSync(join(tmpdir(), 'leanclaw-list-')); roots.push(root)
    writeFileSync(join(root, 'a.md'), 'a'); mkdirSync(join(root, 'folder'))
    const result = await getTool('fs.list').execute({ path: root }, { allowedDirs: [root] })
    expect(result.data?.entries).toEqual([
      { name: 'a.md', type: 'file' },
      { name: 'folder', type: 'directory' }
    ])
  })

  it('执行期再次拒绝 allowedDirs 之外的读取、列目录与写入', async () => {
    const allowed = mkdtempSync(join(tmpdir(), 'leanclaw-allowed-'))
    const outside = mkdtempSync(join(tmpdir(), 'leanclaw-outside-'))
    roots.push(allowed, outside)
    const secret = join(outside, 'config.json')
    writeFileSync(secret, '{"token":"must-not-read"}')

    const attempts = [
      { id: 'fs.read', input: { path: secret } },
      { id: 'fs.list', input: { path: outside } },
      { id: 'fs.write', input: { path: secret, content: 'overwritten' } }
    ] as const

    for (const attempt of attempts) {
      const tool = getTool(attempt.id)
      expect(tool.riskFor(attempt.input, { allowedDirs: [allowed] })).toBe('forbidden')
      await expect(tool.execute(attempt.input, { allowedDirs: [allowed] })).rejects.toThrow(
        /允许目录/
      )
    }
    expect(readFileSync(secret, 'utf8')).toBe('{"token":"must-not-read"}')
  })

  it('拒绝通过 allowedDirs 内的符号链接逃逸到外部目录', async () => {
    const allowed = mkdtempSync(join(tmpdir(), 'leanclaw-symlink-allowed-'))
    const outside = mkdtempSync(join(tmpdir(), 'leanclaw-symlink-outside-'))
    roots.push(allowed, outside)
    const secret = join(outside, 'secrets.json')
    writeFileSync(secret, '{"apiKey":"must-not-read"}')
    symlinkSync(outside, join(allowed, 'escape'))
    const escapedPath = join(allowed, 'escape', 'secrets.json')

    const tool = getTool('fs.read')
    expect(tool.riskFor({ path: escapedPath }, { allowedDirs: [allowed] })).toBe('forbidden')
    await expect(tool.execute({ path: escapedPath }, { allowedDirs: [allowed] })).rejects.toThrow(
      /允许目录/
    )
  })

  it('测试硬边界拒绝读取隔离根外的 DB/配置，即使 allowedDirs 误设过宽', async () => {
    const testRoot = process.env.LEANCLAW_TEST_ROOT
    if (!testRoot) throw new Error('测试隔离根缺失')
    const outside = mkdtempSync(join(dirname(testRoot), 'leanclaw-user-data-sentinel-'))
    roots.push(outside)
    const database = join(outside, 'leanclaw.db')
    const config = join(outside, 'config.json')
    writeFileSync(database, 'must-not-read-or-copy')
    writeFileSync(config, '{"apiKey":"must-not-read"}')

    const broadAllowedDirs = [dirname(testRoot)]
    for (const path of [database, config]) {
      const tool = getTool('fs.read')
      expect(tool.riskFor({ path }, { allowedDirs: broadAllowedDirs })).toBe('forbidden')
      await expect(tool.execute({ path }, { allowedDirs: broadAllowedDirs })).rejects.toThrow(
        /允许目录/
      )
    }
    expect(readFileSync(database, 'utf8')).toBe('must-not-read-or-copy')
    expect(readFileSync(config, 'utf8')).toBe('{"apiKey":"must-not-read"}')
  })
})
