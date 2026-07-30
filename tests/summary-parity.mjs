// T07 双路径对拍入口。
//
// `TaskSummaryView` 有两条派生路径：`listTaskSummaries()` 的批量 SQL 投影，和从推送的完整
// `TaskView` 经 `summarizeTaskView()` 派生。列表行可能来自任意一条，所以它们对同一个 Task
// 必须产出逐字节相同的结果。这条断言需要真实 SQLite，理由见 electron-evidence。
import { runElectronEvidence } from './support/electron-evidence.mjs'

runElectronEvidence({
  scope: 'summary-parity',
  script: 'tests/summary-parity-scenarios.cjs',
  entries: {
    LEANCLAW_ISOLATION_BUNDLE: 'src/runtime/test-isolation.ts'
  },
  reexports: {
    'src/runtime/db.ts': ['initDb', 'getDb'],
    'src/runtime/views.ts': ['buildTaskView', 'listTaskSummaries'],
    'src/shared/task-summary.ts': ['summarizeTaskView']
  }
})
