import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface LaunchedApp {
  app: ElectronApplication
  window: Page
  dataDir: string
}

async function waitForRuntimeReady(window: Page): Promise<void> {
  const deadline = Date.now() + 15_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      await window.evaluate(async () => {
        const api = (
          globalThis as unknown as {
            api: { rpc(request: unknown): Promise<unknown> }
          }
        ).api
        await api.rpc({ method: 'listTasks' })
      })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  throw new Error(`LeanClaw Runtime did not become ready: ${String(lastError)}`)
}

export async function launchApp(
  env: Record<string, string> = {},
  existingDataDir?: string
): Promise<LaunchedApp> {
  const dataDir = existingDataDir ?? mkdtempSync(join(tmpdir(), 'leanclaw-e2e-'))
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: {
      ...(process.env as Record<string, string>),
      LEANCLAW_DATA_DIR: dataDir,
      ANTHROPIC_API_KEY: '',
      LEANCLAW_WEB_MOCK: '1',
      ...env
    }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await waitForRuntimeReady(window)
  return { app, window, dataDir }
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
  await launched.app.close()
  rmSync(launched.dataDir, { recursive: true, force: true })
}
