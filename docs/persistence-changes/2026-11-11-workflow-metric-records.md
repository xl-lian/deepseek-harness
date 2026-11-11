---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-11-workflow-metric-records

English | [中文](2026-11-11-workflow-metric-records.zh.md)

## Summary

Adds the tool-workflow/metric event.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing logs contain no metric events and read unchanged. Current readers fold the event only for the Web run node and the workflowRuns projection, and it never enters model history. Older builds refuse a log containing the new required event type before interpreting it, as for any added ordinary event.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/workflow packages/client/ui-workflow-run: all tests passed.

<a id="dev-note"></a>
## Dev Note

None.
