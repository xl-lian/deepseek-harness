---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-11-workflow-artifact-records

English | [中文](2026-11-11-workflow-artifact-records.zh.md)

## Summary

Adds the tool-workflow/artifact event.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing logs contain no artifact events and read unchanged. Current readers fold the event only for the Web run node, and it never enters model history. Older builds refuse a log containing the new required event type before interpreting it, as for any added ordinary event.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/workflow packages/client/ui-workflow-run: all tests passed.

<a id="dev-note"></a>
## Dev Note

None.
