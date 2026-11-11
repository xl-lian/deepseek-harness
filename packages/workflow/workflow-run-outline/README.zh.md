---
description: "面向客户端与维护者的全日志工作流运行大纲，用于组合或调试 Runs 标签页背后的 workflowRuns 投影。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow-run-outline

[English](README.md) | 中文

## 概述

本包为客户端提供 Session 中每个工作流运行一行的数据，包含状态、时间、成员计数和最新阶段。客户端无需持有 Session 的完整事件日志即可列出所有运行，因此当长时间运行的开始事件不在已加载历史中时，运行仍然可见。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Host 上与 Session 存储和投影注册表一起挂载本插件，无需配置。`web-app` bundle 在 Host 层挂载它，因为预设各自挂载 `dsh-tool-workflow`，而投影表是进程级的。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

该单元折叠 `tool-workflow/*` 记录和 Turn 边界。当启动运行的 Turn 在崩溃后或分叉边界关闭时，没有结算记录的运行会变为已中断；普通 Turn 结束不说明任何事情，因为后台运行比它的 Turn 存活更久。只有行数据会被提供，因此 Turn 边界不改变所提供值的引用。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [工作流工具](../tool-workflow/README.zh.md)——写入本单元折叠的记录。
- [工作流运行节点](../../client/ui-workflow-run/README.zh.md)——渲染 Runs 标签页。
- [Session 投影](../../session/session-projection/README.zh.md)——注册与投递生命周期。

-----

<a id="model-experience"></a>
## 模型体验

无。本包把已记录的日志折叠为面向客户端的读取模型，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与暂缓工作

<a id="known-limitations-and-deferred-work"></a>

- **大纲随运行数量增长**——这些行不进入 Session 摘要，也没有上限，因为与事件数量相比，一个 Session 的运行很少。
- **在正常结束的 Turn 中丢失且没有结算记录的运行会保持运行中**——日志中没有标记其停止的事实。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作背景——点击展开</summary>

无。

</details>
