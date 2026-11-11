---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-11-workflow-progress-records

English | [中文](2026-11-11-workflow-progress-records.zh.md)

## Summary

Adds tool-workflow/phase and tool-workflow/log events and an optional progressEventsDropped field on tool-workflow/run-end.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing logs contain none of these and read unchanged; an absent dropped count means no progress was skipped. Current readers fold the new events only for the Web run node, and they never enter model history. Older builds refuse a log containing the new required event types before interpreting it, as for any added ordinary event.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/workflow/tool-workflow packages/client/ui-workflow-run: all tests passed.

<a id="dev-note"></a>
## Dev Note

None.
