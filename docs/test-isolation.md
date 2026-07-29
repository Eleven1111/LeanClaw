# LeanClaw 自动测试隔离契约

> 状态：T05 已完成并关闭
>
> 生效日期：2026-07-29

## 1. 不变量

自动测试不得把真实用户目录当作默认值，也不得仅依赖“测试会自觉传临时目录”。当 `LEANCLAW_TEST_ROOT` 存在时：

1. `LEANCLAW_DATA_DIR`、`HOME`、`TMPDIR` 必须全部存在且位于该根内；
2. Electron Main 的 `userData`、Utility Runtime 的 data root、MCP 子进程环境和测试导出路径必须保持在该根内；
3. `fs.read`、`fs.list`、`fs.write` 与 `shell.run` 的 cwd 同时受业务 `allowedDirs` 和测试根约束；
4. 越界路径、符号链接逃逸和过宽 `allowedDirs` 必须在风险判断或执行入口立即失败；
5. 每个测试会话创建独立临时根，结束后递归清理。

`LEANCLAW_TEST_ROOT` 只在自动测试中安装。生产启动没有该变量时，仍保留用户显式选择文件、目录和导出位置的现有行为。

## 2. 入口覆盖

| 入口 | 隔离方式 | 失败关闭位置 |
|---|---|---|
| Vitest | `globalSetup` 在测试模块加载前创建独立 root/home/data/tmp | Main/Runtime 入口与工具路径检查 |
| Playwright Electron E2E | `globalSetup` 创建独立根；共享 launcher 强制覆盖保留环境变量 | Electron Main 启动前断言；Runtime 启动前再次断言 |
| `npm run smoke` | Node wrapper 创建临时根后启动 Electron Runtime | Runtime import 时断言 |
| packaged smoke | 必须显式提供 data dir，并验证其位于测试根内 | launcher 与最终 `.app` 入口共同断言 |
| MCP stdio 子进程 | 测试模式下忽略 MCP 配置对四个隔离变量的覆盖 | spawn 前断言并强制继承 |

共享 Playwright launcher 的调用方可以添加普通场景变量，但不能覆盖 `LEANCLAW_TEST_ROOT`、`LEANCLAW_DATA_DIR`、`HOME` 或 `TMPDIR`。

## 3. 路径判定

路径检查先解析现有路径或最近存在父目录的真实路径，再执行目录包含关系判断。因此已有符号链接不能把允许目录内的表面路径指向测试根或 `allowedDirs` 之外。

执行期会重复检查，不把 `riskFor()` 的早期结论当作授权凭证。这个双层检查用于防止调用方绕过风险预检后直接调用工具。

## 4. 可复现验证

```bash
npm run check:static
npm run typecheck
npm test
npm run build
npm run smoke
npm run e2e
```

2026-07-29 本地证据：

- static：5 个文件、22/22；
- unit：40 个文件、357/357；
- production build：PASS；
- Runtime smoke：在独立临时根交付并清理；
- Electron E2E：44/44；
- 越界读取/列目录/写入、符号链接逃逸、过宽 `allowedDirs`、测试变量覆盖均有反证用例；
- 验证结束后未发现 `leanclaw-vitest-*`、`leanclaw-playwright-*`、`leanclaw-runtime-smoke-*` 或 sentinel 临时目录残留。

远端证据：[PR #4 最终 run 30457091843](https://github.com/Eleven1111/LeanClaw/actions/runs/30457091843) 在 Node 24.18.0 / macOS 15 arm64 上通过，`Quality` 47s、`Electron E2E` 3m08s；squash merge 后，[`main` run 30457521961](https://github.com/Eleven1111/LeanClaw/actions/runs/30457521961) 再次通过，`Quality` 1m03s、`Electron E2E` 3m19s。

## 5. 明确边界

- 这是 LeanClaw 自动测试入口和产品文件能力的 fail-closed 契约，不是对任意恶意本机进程的操作系统沙箱；拥有当前用户权限的外部程序仍可绕过应用代码直接访问文件系统。
- 路径检查关闭已有符号链接逃逸，但检查与真正文件操作之间仍存在极窄的并发替换窗口。当前自动测试单进程、受控夹具下不制造这种竞争；若未来允许不可信并发写目录，应升级为基于文件描述符的目录约束。
- CDP 连接到已经启动的 packaged app 时，脚本无法追溯修改该进程的环境；T08 必须由受控 launcher 先安装隔离变量，再连接和验证最终产物。
- 本文的开发态 E2E 与 Runtime smoke 不替代 T08 的 `.app`、签名、ABI、迁移和 packaged Journey 证据。

## 6. 新测试入口检查表

新增 test runner、smoke、子进程或导出场景时，必须同时完成：

1. 在导入 Main/Runtime 前创建独立 `LEANCLAW_TEST_ROOT`；
2. 设置 root 内的 data/home/tmp，禁止场景参数覆盖；
3. 对任何额外工作目录或导出路径执行测试根断言；
4. finally/global teardown 清理临时根；
5. 添加至少一条越界失败断言；
6. 同步本文、[`current-baseline.md`](./current-baseline.md) 和远端 CI 数量。
