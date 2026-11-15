/**
 * Plain research loop constants shared by the host fold and the browser
 * surfaces; this module carries no schema library so the client bundle stays small.
 */

/** The five round stages, in loop order. */
export const RESEARCH_STAGES = ['retrieve', 'plan', 'experiment', 'validate', 'next'] as const

/** One round stage. */
export type ResearchStageId = typeof RESEARCH_STAGES[number]

/** What one workflow member does, read from its label. */
export const MEMBER_KINDS = ['search', 'read', 'refine', 'plan', 'build', 'run', 'debug', 'check', 'challenge', 'recheck', 'next', 'save', 'close'] as const

/** The validator's verdict values. */
export const VERDICTS = ['supported', 'refuted', 'inconclusive', 'invalid', 'exploratory'] as const

/**
 * Whether a value is one of the validator's verdicts.
 * @param value - any value.
 * @returns `true` for a verdict string.
 */
export function isVerdict(value: unknown): value is typeof VERDICTS[number] {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value)
}

/** Stage that owns a member kind. */
export const STAGE_OF: Readonly<Record<typeof MEMBER_KINDS[number], ResearchStageId>> = {
  search: 'retrieve',
  read: 'retrieve',
  refine: 'retrieve',
  plan: 'plan',
  build: 'experiment',
  run: 'experiment',
  debug: 'experiment',
  check: 'validate',
  challenge: 'validate',
  recheck: 'validate',
  save: 'validate',
  next: 'next',
  close: 'next',
}

/** Workflow name the projection follows. */
export const RESEARCH_WORKFLOW = 'research-loop'

/** Agent preset id of the research profile. */
export const RESEARCH_PRESET = 'research'

/** Skill whose load the empty state reports. */
export const RESEARCH_SKILL = 'science-research'
