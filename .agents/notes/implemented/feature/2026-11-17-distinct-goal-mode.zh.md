# Agent Note: Distinct goal mode prompt and presentation

Status: implemented

[English](2026-11-17-distinct-goal-mode.md) | 中文

## 问题

以 `/goal <objective>` 开始的会话，其行为和外观几乎与普通会话相同。每个自动 Round 收到的都是同一段通用续行文字，因此模型从不在开始时确定可检查的完成标准，Round 之间没有交接，而且由于 Round 提示词省略了 `update_goal` 所需的 goal id 与 revision，每次自主完成前都要多调用一次 `get_goal`。在 Web GUI 中，唯一的 goal 界面是 composer 上方的一行条带：`/goal` 以纯文本状态转储回应，每个 Round 都显示为通用的 `继续执行目标` 通知，composer 也看不出发出的消息会调整正在运行的 goal。

## 决策

### Round 提示词

`dsh-goal-round-driver` 渲染两种提示词变体，并共享同一协议。第 1 轮是启动轮：说明会话会自动继续，直到 goal 被标记为完成或受阻，并要求模型在动手前写出可检查的完成标准与里程碑。后续各轮从上一轮的进度说明继续，并对照当前工作区、工具结果和持久会话状态重新核对这些标准；若压缩移除了这些标准，则先重新写出。每轮都以简短进度说明结束，并携带一行 `Goal: id "<id>", revision <n>`；协议要求模型用该引用标记完成，仅当 `update_goal` 拒绝时才重新读取 goal。

`tool:goal` 系统提示词段落、三个工具 schema 与收尾提示词保持不变，因此请求前缀以及所有已记录的系统提示词与工具 schema 快照都逐字节不变。

### 呈现

- **Goal 条带。** `ui-goal` 条带新增由持久阶段、进程本地激活状态与 Session 运行状态推导的状态点、已准入 Round 数与上限，以及显示完整目标与受阻原因的展开区域。
- **Round 标记。** `ui-chat` 以记录的 Round 编号为 goal Turn 触发通知命名（`目标第 3 轮`），并附 goal 专属说明。此处不显示上限，因为持久消息来源只记录 Round 编号。
- **里程碑卡片。** `ui-goal` 把操作为 `create`、`complete` 或 `block` 的 `goal/change` 事件投影为位于 group-tree 位置 `turn` 的 `goal-change` Chat 卡片，使自主运行的结果位于折叠过程之外。
- **命令行。** `/goal` 创建会返回指向其 `goal/change` 事件的 `sourceEventSeq`，`ui-chat` 会省略任何引用 `sourceEventSeq` 的成功命令行；该字段的约定本就说明被引用事件拥有更丰富的呈现。
- **Composer 提示。** 投影中的 goal 为 active 时，`ui-goal` 在 composer 工具行显示 `目标模式` chip，`ui-conversation` 把占位文本换成"发消息可调整方向"；plan 模式的占位文本仍优先。

## 备选方案

**沿用完成前先读取 goal 的做法。** 驱动器已经知道它准入的确切 id 与 revision，且 Round 提示词保留在历史中，因此重述它们每轮只多一行，却能为每次自主完成省去一个模型步骤。被拒绝时回退到 `get_goal`，可在人类并发编辑后保持正确。

**收紧 `tool:goal` 系统提示词段落或工具描述。** 行为差异属于驱动器负责的自动 Round；修改始终存在的段落会改变所有请求前缀，以及从不使用 goal 的会话所对应的全部系统提示词与工具 schema 快照。

**加入禁止在 Round 中询问用户的自主规则。** 未选用：现有的受阻阈值已经约束模型何时停止，一刀切的规则会与合理请求人类输入的工具冲突。

**由 `ui-goal` 通过 keyed 命令 slot 隐藏 `/goal` 文本行。** keyed 的 `goal` 条目必须为每个非创建结果重新渲染通用命令卡片，这需要从 `ui-chat` 进行运行时导入，而目前没有客户端插件这样做。在 `ui-chat` 的可见性规则中一次性应用现有的 `sourceEventSeq` 约定，可把决策留在通用所有者处，也能覆盖今后任何引用其领域事件的命令。

**在对话标记中显示 Round 上限。** 持久的 `goal` 消息来源只携带 `goalId`、`revision` 与 `round`；为条带已显示的值加入上限会改变一个持久化类型。

## 影响

Goal Round 现在以明确的标准开始、以进度说明结束，使长时间自主运行可被审阅，也为后续 Round 提供能抵御叙述漂移的交接；代价是每轮保留的提示词稍长。完成时省去一次工具往返。在 Web GUI 中，goal 会话一眼可辨：composer、条带、每个 Round 边界与每个生命周期里程碑都显示 goal 状态。此变更之前记录的会话仍保留通用的 `/goal` 文本行，因为其命令结果不含 `sourceEventSeq`。若某部署组合了引用 `sourceEventSeq` 的命令，却未组合被引用事件的呈现器，该命令在 Chat 中将没有对应行。
