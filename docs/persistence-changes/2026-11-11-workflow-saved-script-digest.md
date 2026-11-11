---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-11-workflow-saved-script-digest

English | [中文](2026-11-11-workflow-saved-script-digest.zh.md)

## Summary

Adds an optional scriptSha256 field to tool-workflow/run-start for runs of saved workflows.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing records omit the field and remain valid; an absent digest means the run used an inline script or predates saved workflows. Readers ignore the property: the Web workflow-run node reads only runId and name from run-start, and no replay or model projection consumes the event.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/workflow/tool-workflow: 56 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
