import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
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
})
