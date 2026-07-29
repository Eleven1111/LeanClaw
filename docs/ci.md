# LeanClaw 远端 CI 基线

> 状态：workflow 已实现并完成本地等价验证；私有 GitHub 仓库已建立，首次托管 Runner 验证待推送
>
> 建立日期：2026-07-29
>
> Workflow：[`/.github/workflows/ci.yml`](../.github/workflows/ci.yml)

## 1. 触发与权限

CI 在以下事件触发：

- 任意 Pull Request；
- push 到 `main`；
- 手工 `workflow_dispatch`。

Workflow 只授予 `contents: read`，不读取 Repository Secret，不发布产物，也不修改仓库。并发组会取消同一 PR/分支上已经过时的运行。

Checkout 关闭 `persist-credentials`；GitHub 官方 Action 使用审核过的完整 commit SHA 固定，避免可变 major tag 带来的供应链漂移。

2026-07-29 已创建私有仓库 [`Eleven1111/LeanClaw`](https://github.com/Eleven1111/LeanClaw)，并将其配置为本地 `origin`。在首次提交推送、托管 Runner 运行和分支保护核验完成前，仍不得把 T04 标记为关闭。

## 2. 必要门禁

| Job / Check | Runner | 上限 | 命令 | 证明范围 |
|---|---|---:|---|---|
| `CI / Quality` | `macos-15` arm64 | 20 分钟 | 锁文件安装、`npm run check:static`、`npm run typecheck`、`npm test`、`npm run build` | 锁文件安装、治理契约、类型、单元测试、开发态 production build |
| `CI / Electron E2E` | `macos-15` arm64 | 30 分钟 | 锁文件安装、`npm run build`、`npm run e2e` | 开发态 Electron 的 43 条 E2E；依赖 Quality 成功 |

建议将两个 check 都设为 `main` 的 Required Status Check。该仓库设置不在代码仓库内，本轮没有修改，也不能仅凭 workflow 文件声称已启用分支保护。

## 3. 版本与可复现性

- Node 固定为 [`.nvmrc`](../.nvmrc) 中的 `24.18.0`，属于 Node 24 LTS；
- `actions/setup-node@v6` 读取 `.nvmrc` 并只缓存 npm 下载缓存，不缓存 `node_modules`；
- 实际 workflow 将 `actions/checkout v7.0.1` 与 `actions/setup-node v6.4.0` 固定到完整 commit SHA；
- 依赖只通过 `npm ci --no-audit --no-fund --foreground-scripts` 和已提交的 `package-lock.json` 安装；依赖审计保持在 T09，不混入确定性构建门；
- `npm ci` 会执行既有 `postinstall`，为当前 Runner 重建 `better-sqlite3` 等 Electron 原生依赖；
- Runner 固定为 `macos-15`，避免 `macos-latest` 漂移，同时与当前 arm64 产品目标一致。

版本选择依据：

- [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [actions/setup-node](https://github.com/actions/setup-node)
- [Node.js 24 LTS release line](https://nodejs.org/en/about/previous-releases)

## 4. 静态治理检查

仓库当前没有 lint 依赖，本阶段也不新增依赖。`npm run check:static` 使用现有 Vitest 执行以下快速治理契约：

- CI 触发器、权限、Runner、Node、必要命令和分层；
- 数据治理与列表窗口契约；
- macOS 打包配置契约；
- PDF/XLSX 文档解析契约。

它不是 ESLint 的替代品，也不应被描述为完整代码风格检查。若后续需要引入 lint，必须单独评估依赖、规则、存量告警和渐进启用方式。

## 5. E2E、Smoke 与打包边界

- Electron E2E 使用 `tests/e2e/helpers.ts` 创建临时 `LEANCLAW_DATA_DIR`，不应访问真实 `~/.leanclaw`；
- CI 设置 Playwright `forbidOnly` 且不重试，误提交 `test.only` 或首次失败不会被静默掩盖；
- 本 job 启动的是 `out/main/index.js`，因此只能证明开发态 Electron；
- `npm run build` 只生成 production bundle，不生成 `.app`、DMG 或 ZIP；
- 最终 `.app`/ZIP、签名、DMG、packaged Journey A 和历史数据库升级属于 T08，不进入本次 PR/main 必要门；
- 因此两个 CI job 通过后，只能写 `Tests pass` / `Electron E2E pass`，不能写 `Packaged smoke pass`、`Release ready` 或 `Shipped`。

## 6. 本地等价命令

使用 Node 24.18.0，在仓库根目录依次执行：

```bash
npm ci --no-audit --no-fund --foreground-scripts
npm run check:static
npm run typecheck
npm test
npm run build
npm run e2e
```

若本机已有受控的 lockfile 安装，可在不改依赖的验证轮中跳过 `npm ci`；但这不等价于远端冷安装通过。

本轮已在独立 `/tmp` 副本完成一次真实 `npm ci`，随后 static、typecheck、349/349 unit 与 build 均通过。该副本使用本机 Node 23.6.0；Node 24.18.0 仍须由远端 Runner 或另一个已安装 Node 24 的环境验证。

## 7. 远端验收与失败证明

T04 只有在 GitHub 托管 Runner 上满足以下条件后才能关闭：

1. PR 或 `main` 的 `CI / Quality` 与 `CI / Electron E2E` 均真实执行并通过；
2. 日志显示 Node、Runner、`npm ci` 和每个门禁对应当前 commit；
3. 在临时验证分支制造一个确定性失败，证明必要 check 会阻止合并；验证后恢复失败改动；
4. 若启用分支保护，核对 Required Status Check 名称与实际 check 完全一致。

在第一次远端运行前，当前状态只能写“workflow 已实现、本地等价检查通过、远端未验证”。

本轮还在隔离副本临时注入 `test.only`，`CI=true npx playwright test --list` 按预期以退出码 1 拒绝执行；移除临时文件后恢复识别 29 个文件、43 条测试。这证明本地 fail-closed 配置有效，但不证明 GitHub 分支保护会拦截。

## 8. 决策日志

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-07-29 | 使用 Node 24.18.0 LTS | 本地 Node 23 已结束支持；远端门禁需要稳定 LTS，而不是跟随 latest。 |
| 2026-07-29 | 使用 `macos-15` arm64 | 与 macOS arm64 产品和 Electron/native module 运行面一致，并避免 latest 漂移。 |
| 2026-07-29 | Quality 与 Electron E2E 分 job | 失败范围清晰，可分别成为 Required Check；E2E 不掩盖静态/单测结论。 |
| 2026-07-29 | 不在 T04 运行 packaged smoke | 最终产物验证属于 T08；开发态 E2E 不能冒充最终 `.app` 证据。 |
| 2026-07-29 | GitHub 官方 Action 固定完整 SHA | 降低可变 tag 被移动后改变 CI 执行代码的供应链风险。 |
