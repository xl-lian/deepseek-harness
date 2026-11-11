---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-11-workflow-saved-script-digest

[English](2026-11-11-workflow-saved-script-digest.md) | 中文

## 概述

为已保存工作流的运行在 tool-workflow/run-start 上增加可选的 scriptSha256 字段。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-11-workflow-saved-script-digest
baseline: false
changes:
  - root: "event:tool-workflow/run-start"
    previous: "2026-09-11-initial"
    after: "704de16b2cdb8e8533e321a589cfcb139ca32844220067822f06e029e3f055b3"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录不含该字段，仍然有效；缺少摘要表示运行使用内联脚本或早于已保存工作流功能。读取方忽略该属性：Web 的 workflow-run 节点只读取 run-start 的 runId 和 name，回放和模型投影都不消费该事件。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/workflow/tool-workflow：56 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
