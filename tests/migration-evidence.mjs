// T06 迁移证据入口。真实 SQLite 场景在 Electron 进程里运行，理由见 electron-evidence。
import { join } from 'path'
import { runElectronEvidence } from './support/electron-evidence.mjs'

runElectronEvidence({
  scope: 'migration-evidence',
  script: 'tests/migration-evidence-scenarios.cjs',
  entries: {
    LEANCLAW_MIGRATION_DB_BUNDLE: 'src/runtime/db.ts',
    LEANCLAW_MIGRATION_ISOLATION_BUNDLE: 'src/runtime/test-isolation.ts'
  },
  env: {
    LEANCLAW_MIGRATION_FIXTURE: join(
      process.cwd(),
      'tests/fixtures/migrations/v8-old-binary/leanclaw.db'
    )
  }
})
