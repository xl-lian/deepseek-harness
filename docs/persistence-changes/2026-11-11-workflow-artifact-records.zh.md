---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-11-workflow-artifact-records

[English](2026-11-11-workflow-artifact-records.md) | 中文

## 概述

新增 tool-workflow/artifact 事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-11-workflow-artifact-records
baseline: false
changes:
  - root: "event:tool-workflow/artifact"
    previous: null
    after: "9a874c5ff852f7580dfb80f926ee02972b9f6c7ba75477c05c14c5f611d8d8e6"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有日志不含产物事件，读取不受影响。当前读取方仅为 Web 运行节点折叠该事件，它不会进入模型历史。旧版本在解释包含新必需事件类型的日志前会拒绝读取，与新增任何普通事件相同。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/workflow packages/client/ui-workflow-run：全部测试通过。

<a id="dev-note"></a>
## 开发备注

无。
