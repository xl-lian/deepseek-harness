# Agent Note: Durable workflow progress and saved workflows

Status: implemented

English | [中文](2026-11-11-durable-workflow-progress.zh.md)

## Problem

Long multi-agent runs, such as multi-round experiment campaigns, were hard to launch and hard to watch. The model re-emitted a script of more than a thousand lines for every launch, and `phase()` and `log()` reached only the live event bus and a background job's output ring. A foreground run showed no progress, and no progress survived a reload.

## Decision

Deployments list saved-workflow directories through `workflowDirs` on `dsh-tool-workflow`. The catalog is fixed at plugin load so the prompt listing stays prefix-stable, and the script body is read at each launch. `tool-workflow/run-start` records the SHA-256 of the text that ran, because a saved script is not model-visible and the Session log would otherwise not identify it. With no saved workflow, the tool schema and guidance are unchanged.

`phase()` and `log()` calls of a top-level run are recorded as `tool-workflow/phase` and `tool-workflow/log` Session events, bounded per run by validated Config fields, with the skipped count reported on run-end. They are narration. The Web node shows them as a current phase and an activity list and does not derive a static topology from them, so the earlier rule that only member events prove work still holds for member and phase groups.

## Alternatives considered

**Keep progress in the job output ring.** Rejected because the ring exists only for background runs in one process and does not survive a reload.

**Mark the records `ignorable`.** Not available: `ignorable` is written only for `plugin:` records from `packages/experimental/`. These are ordinary Session events, so older builds refuse a log containing them.

**Add a saved-workflow registry service.** Rejected because the capability has one provider and one consumer; a configuration field on the consumer is sufficient.

## Consequences

Sessions gain one Session event per recorded line, up to the configured caps. A script past the caps stops recording progress while it keeps running, and the node reports the skipped count after the run ends. Saved scripts are Host files even when a Session's filesystem is remote.

## Testing

`packages/workflow/tool-workflow/tests` covers catalog failures, the exactly-one-of rule, digests, caps at tiny and exact limits, and failed appends. `packages/client/ui-workflow-run/tests` covers the fold and the display. `snapshots/session/workflow-run` pins the recorded phase event.

## Related

- [Workflow tool](../../../../packages/workflow/tool-workflow/README.md)
- [Workflow-run node](../../../../packages/client/ui-workflow-run/README.md)
