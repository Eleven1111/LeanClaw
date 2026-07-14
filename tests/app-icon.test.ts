import { describe, expect, it } from 'vitest'
import { appIconCandidates } from '../src/main/appIcon'

describe('appIconCandidates', () => {
  it('优先使用打包资源，并保留开发构建目录回退', () => {
    expect(appIconCandidates('/Applications/LeanClaw.app/Contents/Resources/app.asar', '/repo/out/main', '/Applications/LeanClaw.app/Contents/Resources')).toEqual([
      '/Applications/LeanClaw.app/Contents/Resources/resources/icon.png',
      '/Applications/LeanClaw.app/Contents/Resources/app.asar/resources/icon.png',
      '/repo/resources/icon.png'
    ])
  })
})
