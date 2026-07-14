import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { appIconCandidates } from '../src/main/appIcon'

interface PackageConfig {
  author?: string
  scripts: Record<string, string>
  devDependencies: Record<string, string>
  build?: {
    appId?: string
    productName?: string
    asar?: boolean
    asarUnpack?: string[]
    artifactName?: string
    directories?: { output?: string }
    files?: string[]
    extraResources?: Array<{ from?: string; to?: string; filter?: string[] }>
    mac?: { icon?: string; identity?: string | null; hardenedRuntime?: boolean; target?: string[] }
  }
}

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageConfig

describe('local macOS packaging contract', () => {
  it('provides explicit local-only app and distributable scripts', () => {
    expect(packageJson.author).toBe('LeanClaw')
    expect(packageJson.devDependencies['electron-builder']).toMatch(/^\^26\./)
    expect(packageJson.devDependencies['@electron/rebuild']).toBeUndefined()
    expect(packageJson.scripts.postinstall).toBe('electron-builder install-app-deps')
    expect(packageJson.scripts['package:mac']).toContain('electron-builder --mac --dir --arm64')
    expect(packageJson.scripts['dist:mac']).toContain('electron-builder --mac dmg zip --arm64 --publish never')
  })

  it('packages only production output and keeps native/resource files accessible', () => {
    expect(packageJson.build).toMatchObject({
      appId: 'com.leanclaw.desktop',
      productName: 'LeanClaw',
      asar: true,
      asarUnpack: ['node_modules/better-sqlite3/**'],
      artifactName: '${productName}-${version}-${arch}.${ext}',
      directories: { output: 'release' },
      files: ['out/**/*', 'package.json'],
      extraResources: [{
        from: 'resources',
        to: 'resources',
        filter: ['icon.png', 'icon.icns']
      }],
      mac: {
        icon: 'resources/icon.icns',
        identity: '-',
        hardenedRuntime: false,
        target: ['dmg', 'zip']
      }
    })
  })

  it('resolves packaged resources before app and development fallbacks', () => {
    expect(appIconCandidates('/Applications/LeanClaw.app/Contents/Resources/app.asar', '/repo/out/main', '/Applications/LeanClaw.app/Contents/Resources')).toEqual([
      '/Applications/LeanClaw.app/Contents/Resources/resources/icon.png',
      '/Applications/LeanClaw.app/Contents/Resources/app.asar/resources/icon.png',
      '/repo/resources/icon.png'
    ])
  })

  it('keeps local artifacts out of Git', () => {
    expect(readFileSync(join(process.cwd(), '.gitignore'), 'utf8').split('\n')).toContain('release/')
  })
})
