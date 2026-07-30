import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
const nodeVersion = readFileSync(join(root, '.nvmrc'), 'utf8').trim()
const playwrightConfig = readFileSync(join(root, 'playwright.config.ts'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

describe('remote CI contract', () => {
  it('runs for pull requests, main pushes, and manual verification with least privilege', () => {
    expect(workflow).toMatch(/\non:\n\s+pull_request:\n\s+push:\n\s+branches:\n\s+- main\n\s+workflow_dispatch:/)
    expect(workflow).toContain('permissions:\n  contents: read')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).not.toContain('secrets.')
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(2)
  })

  it('pins a supported Node LTS line and the macOS arm64 runner', () => {
    expect(nodeVersion).toBe('24.18.0')
    expect(workflow.match(/uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g)).toHaveLength(2)
    expect(workflow.match(/uses: actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/g)).toHaveLength(2)
    expect(workflow.match(/node-version-file: \.nvmrc/g)).toHaveLength(2)
    expect(workflow.match(/cache-dependency-path: package-lock\.json/g)).toHaveLength(2)
    expect(workflow.match(/runs-on: macos-15/g)).toHaveLength(2)
    expect(workflow.match(/CI requires macOS arm64/g)).toHaveLength(2)
  })

  it('fails the quality job on install, governance, type, unit, or build errors', () => {
    expect(packageJson.scripts['check:static']).toBe(
      'vitest run tests/ci.test.ts tests/governance.test.ts tests/packaging.test.ts tests/document-files.test.ts tests/test-isolation.test.ts'
    )
    expect(workflow.match(/run: npm ci --no-audit --no-fund --foreground-scripts/g)).toHaveLength(2)
    for (const command of [
      'npm run check:static',
      'npm run typecheck',
      'npm test',
      'npm run migration:evidence',
      'npm run parity:evidence',
      'npm run build'
    ]) {
      expect(workflow).toContain(`run: ${command}`)
    }
    expect(workflow).toContain('timeout-minutes: 20')
  })

  it('keeps Electron E2E separate and does not impersonate packaged smoke', () => {
    expect(workflow).toMatch(/electron-e2e:\n\s+name: Electron E2E\n\s+needs: quality/)
    expect(workflow).toContain('run: npm run e2e')
    expect(workflow).toContain('timeout-minutes: 30')
    expect(workflow).not.toContain('npm run dist:mac')
    expect(workflow).not.toContain('npm run package:mac')
    expect(playwrightConfig).toContain('forbidOnly: !!process.env.CI')
    expect(playwrightConfig).toContain('retries: 0')
  })
})
