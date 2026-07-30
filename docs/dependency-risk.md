# LeanClaw 依赖风险台账

> 状态：T09 已完成
>
> 刷新日期：**2026-07-30**（UTC 14:59）
>
> 刷新命令：`npm audit`、`npm audit --omit=dev`、`npm audit --json`、`gh api /advisories/<GHSA>`

## 1. 本文的判定规则

- **可达性优先于计数**。`npm audit` 的总数不是风险，它只是"依赖树里存在被标记的版本"。判定要落到：这段代码在 LeanClaw 里会不会被执行、被谁的输入触发、在哪个平台。
- **不为清零盲目降级**。降级 Electron、native module 或构建链换来的"0 vulnerabilities"，用一个真实的旧版本风险换一个不可达的新版本风险。
- **每个保留项必须有复查日期**，否则台账会腐烂成"当时看过一眼"。
- 依赖树一旦变化（lockfile 变更），必须重新执行 install、typecheck、unit、build、E2E 与最终产物验证，并刷新产物 hash。

## 2. 依赖分层

| 层 | 含义 | 是否进入最终产物 |
|---|---|---|
| production | `dependencies`，随 `.app` 分发并在运行时执行 | 是 |
| development | 测试、类型、构建工具链 | 否 |
| build-time | 只在 `npm run dist:mac` 期间执行的打包器及其依赖 | 否（打包器自身不入包） |
| 不可达 | 在依赖树里，但 LeanClaw 从不加载的代码路径 | 视层而定 |

当前：`dependencies` 只有 `@modelcontextprotocol/sdk` 与 `better-sqlite3` 两个直接依赖。

## 3. 本轮结论

```text
npm audit             → 16 high（全部来自同一条 brace-expansion advisory）
npm audit --omit=dev  → found 0 vulnerabilities
```

**生产依赖树当前零 advisory。**

### 3.1 已修复：`@hono/node-server` 路径穿越（GHSA-frvp-7c67-39w9）

| 项 | 事实 |
|---|---|
| 严重度 | moderate（CVSS 5.9） |
| 影响范围 | `< 2.0.5`，首个修复版本 `2.0.5` |
| 层 | **production**（经 `@modelcontextprotocol/sdk` 引入） |
| 可达性 | **本来就不可达**：LeanClaw 只用 SDK 的 `StdioClientTransport`（MCP 客户端），受影响的是服务端 `serve-static`；且该穿越只在 **Windows** 上触发，而 LeanClaw 只分发 macOS arm64 |
| 处置 | 仍然修复。`@modelcontextprotocol/sdk` 升到 `^1.30.0`（in-range minor，非降级），其声明为 `^1.19.9 \|\| ^2.0.5`，npm 却解析到仍受影响的 `1.19.15`，因此再加 `overrides: { "@hono/node-server": "^2.0.5" }` 把它顶到 `2.0.12` |
| 理由 | 生产依赖上的可修复项不留。override 只是把版本推进到 SDK 自己声明支持的区间上沿，不是降级，也不是跨越 SDK 的兼容边界 |

### 3.2 保留：`brace-expansion` DoS（GHSA-mh99-v99m-4gvg）

| 项 | 事实 |
|---|---|
| 严重度 | high |
| 公布日期 | 2026-07-24（本轮刷新前 6 天） |
| 影响范围 | `<= 5.0.7`，首个修复版本 **`5.0.8`**（GitHub Advisory 只给出这一条区间，没有 1.x/2.x 的 backport） |
| 当前安装 | `1.1.16`、`2.1.2`，全部位于 `electron-builder` 的依赖链下（`@electron/asar`、`@electron/universal`、`dir-compare`、`glob`、`minimatch`、`filelist`/`jake`/`ejs`、`rimraf`/`temp`） |
| 层 | **build-time**：`npm ls brace-expansion --omit=dev` 为空，打包器自身不进入 `.app` |
| 可达性 | 触发需要攻击者可控的 brace 模式。这里的 glob 模式全部来自仓库自己的 `package.json`（`files`、`asarUnpack`、`extraResources`），没有外部输入面；且只在开发者本机执行 `npm run dist:mac` 时运行 |
| npm 给出的"修复" | `electron-builder@22.14.13` —— 从 `26.15.3` **降 4 个大版本** |
| 处置 | **保留** |
| 拒绝降级的理由 | 26.x 是当前打包、签名、ASAR unpack 与 native 重建的既有验证面（T08 的 10/10 台账建立在它之上）。为一个不可达的构建期 DoS 回退到 2021 年的打包器，是用真实的回归风险换一个计数 |
| 拒绝 override 的理由 | 唯一修复版本是 `5.0.8`，而消费者钉的是 `^1.1.7` / `^2.0.1`。把 `brace-expansion@5` 塞进 `minimatch@3` 是跨大版本强行替换，可能在打包期静默改变 glob 行为——风险高于它要消除的风险 |
| 缓解 | 打包只在受控本机执行；glob 模式全部来自仓库自身；产物每次重新生成并由 `npm run verify:packaged` 校验 hash 与内容 |
| 复查日期 | **2026-08-30**，或 `electron-builder` 发布把链上依赖推到 `brace-expansion >= 5.0.8` 的版本时（以先到者为准） |

## 4. 依赖变更后的重新验证（本轮已执行）

lockfile 变化后必须全跑，不能只跑受影响的模块：

| 门禁 | 结果 |
|---|---|
| `npm install`（含 `electron-builder install-app-deps` 原生重建） | PASS |
| `npm run check:static` | 22/22 PASS |
| `npm run typecheck` | PASS |
| `npm test` | 367/367 PASS |
| `npm run migration:evidence` | 13/13 PASS |
| `npm run parity:evidence` | 5/5 PASS |
| `npm run build` | PASS |
| `npm run smoke` | 独立临时根 `delivered` |
| `npm run e2e` | 46/46 PASS |
| `rm -rf release && npm run dist:mac && npm run verify:packaged` | 10/10 OK |

**依赖变更后的新产物 hash**（旧 hash 已随 lockfile 失效，不得继续引用）：

- DMG `27ddfb227ea0b30be88e5a0a70a59472be2d39fb2beed2a8ad5d31980403951c`
- ZIP `fdefecd6c4bdfef56fa14a3fc65bc50c9d4bbc24611ee620b0688219b117860f`

## 5. 明确边界

- advisory 是**动态**的：本文的结论只对 2026-07-30 的数据库快照成立，任何新的刷新都必须重跑命令并更新本文，不能引用旧结论。
- `npm audit --omit=dev` 为 0 **不等于**生产代码没有漏洞，它只表示当前依赖树里没有已公开、已被 npm 收录的 advisory。
- 本文不覆盖 Electron 自身的 CVE 跟踪。Electron `43.1.0` 的安全更新属于独立的升级决策，需要重跑打包与产物验证。
- 保留项不是"忽略"。到复查日期没有复查，等于台账失效。
