# Agent Note: 持久化工作流进度与已保存工作流

Status: implemented

[English](2026-11-11-durable-workflow-progress.md) | 中文

## Problem

长时间的多智能体运行（例如多轮实验活动）启动和观察都很困难。模型每次启动都要重新输出一千多行脚本，`phase()` 和 `log()` 只进入实时事件总线和后台任务的输出环。前台运行不显示进度，任何进度在重新加载后都不会保留。

## Decision

部署方通过 `dsh-tool-workflow` 的 `workflowDirs` 列出已保存工作流目录。目录清单在插件加载时固定，使提示词列表保持前缀稳定，脚本体在每次启动时读取。`tool-workflow/run-start` 记录实际运行文本的 SHA-256，因为已保存脚本对模型不可见，否则 Session 日志无法确定运行的是哪份脚本。没有已保存工作流时，工具 schema 和指导不变。

顶层运行的 `phase()` 和 `log()` 调用记录为 `tool-workflow/phase` 和 `tool-workflow/log` Session 事件，每次运行的数量受已校验的 Config 字段限制，跳过的数量在 run-end 上报告。它们属于叙述信息。Web 节点把它们显示为当前阶段和活动列表，不从中推导静态拓扑，因此“只有成员事件才能证明工作发生”的既有规则对成员和阶段分组依然成立。

## Alternatives considered

**把进度保留在任务输出环中。** 已否决，因为输出环只存在于单个进程的后台运行中，重新加载后不会保留。

**把记录标记为 `ignorable`。** 不可行：只有 `packages/experimental/` 的 `plugin:` 记录才会写入 `ignorable`。这些是普通 Session 事件，因此旧版本会拒绝包含它们的日志。

**新增已保存工作流注册服务。** 已否决，因为该能力只有一个提供方和一个消费方，在消费方上增加配置字段已经足够。

## Consequences

每条记录的行都会增加一个 Session 事件，上限由配置决定。脚本超过上限后继续运行但不再记录进度，节点在运行结束后报告跳过的数量。即使 Session 的文件系统在远程，已保存脚本也是 Host 文件。

## Testing

`packages/workflow/tool-workflow/tests` 覆盖目录清单失败、二选一规则、摘要、极小与精确上限以及追加失败。`packages/client/ui-workflow-run/tests` 覆盖折叠逻辑和显示。`snapshots/session/workflow-run` 固定记录的阶段事件。

## Related

- [工作流工具](../../../../packages/workflow/tool-workflow/README.zh.md)
- [工作流运行节点](../../../../packages/client/ui-workflow-run/README.zh.md)
