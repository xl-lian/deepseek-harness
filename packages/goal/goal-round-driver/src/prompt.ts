/** Model-visible continuation prompt for one same-session goal round. */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { GoalView } from '@deepseek-ai/dsh-goal'

/** Round 1: fix the completion criteria before any work starts. */
const KICKOFF =
  'This is the first round of a persisted goal. This session continues automatically, one round at a '
  + 'time, until the goal is marked complete or blocked. Before working, state the completion criteria: '
  + 'concrete, checkable conditions that together mean the whole objective is achieved. Then list the '
  + 'milestones and start on the first one.'

/** Rounds 2+: resume from the previous progress note and re-check the criteria. */
const CONTINUATION =
  'Continue from the previous round\'s progress note. Check the completion criteria against the current '
  + 'workspace, tool results, and durable session state instead of assuming earlier narration is still '
  + 'current; if the criteria are no longer in this session, restate them first. Work on the next '
  + 'unfinished milestone.'

/** Shared round protocol: progress, hand-off note, and completion with the exact goal reference. */
const PROTOCOL =
  'Make concrete progress and verify it. End the round with a short progress note: what was completed '
  + 'and verified, what remains, and the next step. If work remains, leave the goal active for the next '
  + 'round. When every completion criterion is met and verified, call update_goal with the goal id and '
  + 'revision above, action complete, and every other field left empty; read the goal again only if that '
  + 'call rejects them. Follow the configured goal-tool policy before reporting a blocker.'

/**
 * Render the complete goal-round instruction retained in session history.
 * Round 1 asks for completion criteria and milestones; later rounds resume
 * from the previous progress note. Every round carries the exact goal id and
 * revision that `update_goal` requires.
 * @param goal - exact active goal revision being admitted.
 * @param round - next positive round number.
 * @returns a fresh one-block prompt for `Agent.followup()`.
 */
export function renderGoalRoundPrompt(goal: GoalView, round: number): ContentBlock[] {
  return [{
    type: 'text',
    text: '<goal_round>\n'
      + `Objective: ${JSON.stringify(goal.objective)}\n`
      + `Goal: id ${JSON.stringify(goal.id)}, revision ${goal.revision}\n`
      + `Round: ${round}/${goal.maxGoalRounds}\n\n`
      + `${round === 1 ? KICKOFF : CONTINUATION} ${PROTOCOL}\n`
      + '</goal_round>',
  }]
}
