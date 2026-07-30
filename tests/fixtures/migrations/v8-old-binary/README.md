# v8 old-binary 迁移 fixture

> `source_kind`: `synthetic-old-binary`
>
> 生成日期：2026-07-30 · Schema：v8 · 平台：darwin-arm64

## 1. 这是什么，不是什么

| 分类 | 是否适用 | 说明 |
|---|---|---|
| synthetic historical-schema | 否 | 不是由测试代码按历史列定义重建的表结构。 |
| **synthetic old-binary** | **是** | 表、索引与约束由锚点提交 `15831e5` 自己构建出的 `out/main/runtime.js` 调用旧版 `initDb()` 创建。 |
| real historical | 否 | 没有读取、复制或 hash 任何真实用户数据库；行数据全部是脚本内的合成常量。 |

“old-binary” 指 **schema 由旧版程序创建**。数据行由 `generate.mjs` 的 `SEED_SQL` 通过
`/usr/bin/sqlite3` 写入这个旧库，不是旧版业务流程跑出来的，也不冒充真实用户内容。

## 2. 内容

- 1 个已交付历史 Task（`legacy-task`）及其 Run / Step / Artifact / Evidence / 事件 / 归档事件；
- 1 个历史 Automation（`legacy-schedule`）；
- 3 个**当前代码完全不认识**的合法对象，用于证明迁移不会误删用户/运维留下的痕迹：
  - 表 `legacy_task_audit`；
  - 索引 `idx_legacy_manual_task_created`；
  - 触发器 `trg_legacy_task_audit`（`AFTER UPDATE ON tasks`，升级后仍然生效）。

v8 库里唯一的 `idx_%` 索引就是上面那个手工索引，因此升级后出现的 13 个 `idx_*` 只能来自
migration v13——这正是 `tests/e2e/phase2-migration.spec.ts` 的手工降级夹具无法证明的部分。

## 3. 重新生成

```bash
node tests/fixtures/migrations/v8-old-binary/generate.mjs
```

脚本会：核验锚点提交（最高 migration 必须是 v8、含完整 SCHEMA、含 lockfile 与构建入口）→
在 `$TMPDIR` 建临时 worktree → 用该提交自己的 `package-lock.json` 安装并构建 →
在临时 `HOME` / `TMPDIR` / `LEANCLAW_DATA_DIR` 下启动旧 Runtime 建库 → 写入 `SEED_SQL` →
`wal_checkpoint(TRUNCATE)` + `integrity_check` → 复制并记账 → 删除 worktree 与临时根。

脚本拒绝把 fixture 输出到真实用户数据目录，旧 Runtime 也拿不到真实 `HOME`。

## 4. 可复现性边界

`manifest.json` 里的 `sha256` 描述**当前这个文件**，不是“重新生成必然得到同一字节”的承诺：
SQLite 的页布局与 freelist 与写入过程相关，二进制字节不保证逐字节可复现。
可复现的是 `semantic_fingerprint_sha256`（`sqlite_master` 规范化后的对象定义 + 每表列数）
与 `row_counts`。校验字节一致性用：

```bash
shasum -a 256 tests/fixtures/migrations/v8-old-binary/leanclaw.db
```

## 5. 谁在用它

- `npm run migration:evidence`：真实 SQLite 场景（升级、指纹对拍、未知对象、重复启动、回滚）；
- `tests/e2e/t06-fixture-migration.spec.ts`：开发态 Electron 升级 + 迁移后真实 Task 主路径。

两者都只读复制品：先把 `leanclaw.db` 拷进隔离数据根，再让应用接触它。

packaged `.app` 的旧库升级不在本 fixture 的证据范围内，属于 T08。
