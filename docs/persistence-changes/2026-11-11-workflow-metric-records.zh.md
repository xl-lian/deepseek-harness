---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-11-workflow-metric-records

[English](2026-11-11-workflow-metric-records.md) | 中文

## 概述

新增 tool-workflow/metric 事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-11-workflow-metric-records
baseline: false
changes:
  - root: "event:tool-workflow/metric"
    previous: null
    after: "f2a41cf1ae424449a020d1af3ec264e9c44e76471bba1553ca91b2b29c7576b6"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有日志不含指标事件，读取不受影响。当前读取方仅为 Web 运行节点和 workflowRuns 投影折叠该事件，它不会进入模型历史。旧版本在解释包含新必需事件类型的日志前会拒绝读取，与新增任何普通事件相同。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/workflow packages/client/ui-workflow-run：全部测试通过。

<a id="dev-note"></a>
## 开发备注

无。
