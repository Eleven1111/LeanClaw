import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  appendDiagnosticEvent,
  buildDiagnosticManifest,
  serializeDiagnosticEvent,
  stageDiagnosticBundle
} from '../src/main/diagnostics'

describe('diagnostics privacy boundary', () => {
  it('drops error messages and replaces private roots in stack frames', () => {
    const error = new Error('客户机密任务 sk-ant-secret Bearer token')
    error.stack = [
      'Error: 客户机密任务 sk-ant-secret Bearer token',
      '    at run (/Users/na/private-project/客户名单-sk-ant-secret.ts:4:2)'
    ].join('\n')

    const line = serializeDiagnosticEvent({
      timestamp: '2026-07-14T00:00:00.000Z',
      process: 'runtime',
      level: 'error',
      event: 'uncaught-exception',
      error
    }, ['/Users/na/private-project'])

    expect(line).not.toContain('客户机密任务')
    expect(line).not.toContain('sk-ant-secret')
    expect(line).not.toContain('Bearer token')
    expect(line).not.toContain('客户名单')
    expect(line).not.toContain('/Users/na/private-project')
    expect(JSON.parse(line)).toMatchObject({
      process: 'runtime',
      level: 'error',
      event: 'uncaught-exception',
      error: { name: 'Error', frames: ['at run (<private>:4:2)'] }
    })
  })

  it('rotates bounded log history instead of growing indefinitely', () => {
    const root = mkdtempSync(join(tmpdir(), 'leanclaw-diagnostic-log-'))
    for (let index = 0; index < 8; index++) {
      appendDiagnosticEvent({
        logDir: root,
        process: 'main',
        level: 'info',
        event: `event-${index}`,
        maxBytes: 120,
        history: 2,
        timestamp: `2026-07-14T00:00:0${index}.000Z`
      })
    }

    expect(readdirSync(root).sort()).toEqual(['main.log', 'main.log.1', 'main.log.2'])
    expect(readFileSync(join(root, 'main.log'), 'utf8')).toContain('event-7')
    expect(readdirSync(root)).not.toContain('main.log.3')
  })

  it('stages only allowlisted logs and a fixed system manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'leanclaw-diagnostic-source-'))
    const logsDir = join(root, 'logs')
    const targetDir = join(root, 'bundle')
    appendDiagnosticEvent({ logDir: logsDir, process: 'main', level: 'info', event: 'app-ready' })
    appendDiagnosticEvent({ logDir: logsDir, process: 'runtime', level: 'info', event: 'runtime-ready' })
    writeFileSync(join(logsDir, 'config.json'), '{"apiKey":"secret"}')
    writeFileSync(join(logsDir, 'leanclaw.db'), 'task body')
    writeFileSync(join(logsDir, 'secrets.json'), 'ciphertext')

    const manifest = buildDiagnosticManifest({
      createdAt: '2026-07-14T00:00:00.000Z',
      appVersion: '0.1.0',
      platform: 'darwin',
      arch: 'arm64',
      packaged: false,
      versions: { electron: '43.1.0', node: '24.0.0', chrome: '144.0.0' },
      apiKey: 'must-not-leak',
      taskContent: 'must-not-leak'
    } as never)
    const staged = stageDiagnosticBundle({ logsDir, targetDir, manifest })

    expect(staged.sort()).toEqual(['main.log', 'runtime.log', 'system.json'])
    expect(readdirSync(targetDir).sort()).toEqual(['main.log', 'runtime.log', 'system.json'])
    const bundleText = readdirSync(targetDir)
      .map((name) => readFileSync(join(targetDir, name), 'utf8'))
      .join('\n')
    expect(bundleText).not.toContain('must-not-leak')
    expect(bundleText).not.toContain('task body')
    expect(bundleText).not.toContain('secrets.json')
  })
})
