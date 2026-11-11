---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-11-workflow-progress-records

[English](2026-11-11-workflow-progress-records.md) | 中文

## 概述

新增 tool-workflow/phase 和 tool-workflow/log 事件，并在 tool-workflow/run-end 上增加可选的 progressEventsDropped 字段。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-11-workflow-progress-records
baseline: false
changes:
  - root: "event:tool-workflow/log"
    previous: null
    after: "d1a76ca217758d3ffe98fa1a5edbe84d754b66228cd9436ef2fd8c4de38e1886"
    decision: same-version
  - root: "event:tool-workflow/phase"
    previous: null
    after: "49d14928d15c22e1caaab450eb5e0df37bd0165d0c2d460cbff8cdea371aa28b"
    decision: same-version
  - root: "event:tool-workflow/run-end"
    previous: "2026-09-11-initial"
    after: "017d6e137661a7c636f963ecb82f2e27745205268733c3f4a2cc80c2e6a5cfba"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有日志不含这些内容，读取不受影响；缺少丢弃计数表示没有跳过进度。当前读取方仅为 Web 运行节点折叠新事件，它们不会进入模型历史。旧版本在解释包含新必需事件类型的日志前会拒绝读取，与新增任何普通事件相同。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/workflow/tool-workflow packages/client/ui-workflow-run：全部测试通过。

<a id="dev-note"></a>
## 开发备注

无。
