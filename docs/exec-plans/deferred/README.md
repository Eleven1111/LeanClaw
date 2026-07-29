# Deferred 执行计划

这里只保存用户明确暂缓的计划。

每份计划必须记录：

- `archive_reason`；
- `archived_at`；
- 可观察、可判断的 `restart_condition`。

不得从本目录领取任务。只有用户主动要求恢复且重启条件满足后，才可移回 `active/`。
