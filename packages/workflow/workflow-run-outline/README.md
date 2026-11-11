---
description: "Whole-log workflow run outline for clients and maintainers composing or debugging the workflowRuns projection behind the Runs tab."
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow-run-outline

English | [中文](README.zh.md)

## Summary

This package gives clients one row per workflow run in a Session, with status, timing, member counts, and the latest phase. A client can list every run without holding the Session's complete event log, so a long-running run stays visible when its start is outside the loaded history.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin on the Host beside the Session store and the projection registry. It takes no configuration. The `web-app` bundle mounts it at Host level because presets mount `dsh-tool-workflow` individually while the projection table is process-wide.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The unit folds `tool-workflow/*` records and Turn boundaries. A run with no settlement becomes interrupted when the Turn that started it closes after a crash or at a fork boundary; an ordinary Turn end says nothing, because a background run outlives its Turn. Only the rows are served, so a Turn boundary leaves the served value's identity unchanged.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Workflow tool](../tool-workflow/README.md) — writes the records this unit folds.
- [Workflow-run node](../../client/ui-workflow-run/README.md) — renders the Runs tab.
- [Session projections](../../session/session-projection/README.md) — the registration and delivery lifecycle.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package folds already-logged records into a client-facing read model and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The outline grows with the number of runs** — rows are excluded from Session summaries, and no cap applies because a Session holds few runs compared with its events.
- **A run lost without a settlement in a normally ended Turn stays running** — the log carries no fact that marks it stopped.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
