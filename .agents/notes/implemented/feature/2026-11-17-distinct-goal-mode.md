# Agent Note: Distinct goal mode prompt and presentation

Status: implemented

English | [中文](2026-11-17-distinct-goal-mode.zh.md)

## Problem

A session started with `/goal <objective>` behaved and looked almost like an ordinary session. Every automatic round received the same generic continuation paragraph, so the model never fixed checkable completion criteria at the start, left no hand-off between rounds, and needed an extra `get_goal` call before every autonomous completion because the round prompt omitted the goal id and revision that `update_goal` requires. In the Web GUI the only goal surface was a one-line strip above the composer: `/goal` answered with a plain-text status dump, every round appeared as the generic `Continuing goal` notice, and the composer gave no sign that sent messages steer a running goal.

## Decision

### Round prompt

`dsh-goal-round-driver` renders two prompt variants with one shared protocol. Round 1 is a kickoff: it states that the session continues automatically until the goal is marked complete or blocked and asks the model to state checkable completion criteria and milestones before working. Later rounds continue from the previous round's progress note and re-check those criteria against the current workspace, tool results, and durable session state, restating them when compaction removed them. Every round ends with a short progress note and carries a `Goal: id "<id>", revision <n>` line, and the protocol tells the model to complete with that reference and to read the goal again only when `update_goal` rejects it.

The `tool:goal` system-prompt section, the three tool schemas, and the wrap-up prompt are unchanged, so request prefixes and every recorded system-prompt and tool-schema snapshot stay byte-identical.

### Presentation

- **Goal strip.** The `ui-goal` strip adds a status dot derived from durable phase, process-local activation, and the Session running state; the admitted round count against the cap; and a disclosure that shows the full objective and blocker reason.
- **Round markers.** `ui-chat` titles a goal Turn trigger with its recorded round number (`Goal round 3`) and a goal-specific explanation. The cap is not shown there because the durable message source records only the round.
- **Milestone cards.** `ui-goal` projects `goal/change` events whose operation is `create`, `complete`, or `block` into a `goal-change` Chat card at group-tree position `turn`, so an autonomous run's outcome stays outside the folded process.
- **Command row.** `/goal` creation returns `sourceEventSeq` naming its `goal/change` event, and `ui-chat` omits any successful command row that cites `sourceEventSeq`, as that field's contract already states that the cited event owns a richer presentation.
- **Composer cue.** While the projected goal is active, `ui-goal` shows a `Goal mode` chip in the composer tool row and `ui-conversation` swaps the placeholder to say that messages steer the goal; plan mode's placeholder still wins.

## Alternatives considered

**Ask the model to read the goal before completing, as before.** The driver already knows the exact id and revision it admits, and the round prompt is retained in history, so restating them costs one line per round and removes one model step per autonomous completion. Keeping `get_goal` as the fallback on rejection preserves correctness after a concurrent human edit.

**Tighten the `tool:goal` system-prompt section or tool descriptions.** The behaviour differences belong to automatic rounds, which the driver owns; changing the always-present section would alter every request prefix and every recorded system-prompt and tool-schema snapshot for sessions that never use a goal.

**Add autonomy rules that forbid asking the user during rounds.** Not selected: the existing blocked threshold already governs when the model stops, and a blanket rule would conflict with tools that legitimately request human input.

**Hide the `/goal` text row from `ui-goal` through the keyed command slot.** A keyed `goal` entry would have to re-render the generic command card for every non-creation result, which needs a runtime import from `ui-chat` that no client plugin uses. Applying the existing `sourceEventSeq` contract once in `ui-chat`'s visibility rule keeps the decision in the generic owner and covers any future command that cites its domain event.

**Put the round cap in the transcript marker.** The durable `goal` message source carries only `goalId`, `revision`, and `round`; adding the cap would change a persisted type for a value the strip already shows.

## Consequences

Goal rounds now open with explicit criteria and close with progress notes, which makes long autonomous runs reviewable and gives later rounds a hand-off that survives narration drift; the cost is a slightly longer retained prompt per round. Completion saves a tool round trip. In the Web GUI a goal session is visibly distinct: the composer, the strip, each round boundary, and each lifecycle milestone show goal state. Sessions recorded before this change keep the generic `/goal` text row because their command results carry no `sourceEventSeq`. Any deployment that composes a command citing `sourceEventSeq` without composing the cited event's presenter loses that command's row in Chat.
