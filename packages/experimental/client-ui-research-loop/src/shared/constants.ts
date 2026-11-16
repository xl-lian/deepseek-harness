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

/** Skills whose load the empty state reports: the research, paper, and campaign skills. */
export const SCIENCE_SKILLS: readonly string[] = ['science-research', 'science-paper', 'science-agent', 'science-agent-kaggle']

/** Campaign workflow names whose runs become campaign rounds. */
export const CAMPAIGN_WORKFLOWS: readonly string[] = ['kaggle-round', 'science-round', 'science-campaign']

/** Workflow name of the paper-writing runs the projection follows. */
export const PAPER_WORKFLOW = 'paper-writing'

/** The paper-writing stages, in workflow order. */
export const PAPER_STAGES = ['outline', 'figures', 'draft', 'audit', 'revise', 'compile'] as const

/** One paper-writing stage. */
export type PaperStageId = typeof PAPER_STAGES[number]

/** What one paper-writing member does, read from its label. */
export const PAPER_MEMBER_KINDS = ['setup', 'outline', 'references', 'item', 'section', 'check', 'audit', 'review', 'revise', 'compile', 'fix'] as const

/** Stage that owns a paper member kind. */
export const PAPER_STAGE_OF: Readonly<Record<typeof PAPER_MEMBER_KINDS[number], PaperStageId>> = {
  setup: 'outline',
  outline: 'outline',
  references: 'figures',
  item: 'figures',
  section: 'draft',
  check: 'audit',
  audit: 'audit',
  review: 'audit',
  revise: 'revise',
  compile: 'compile',
  fix: 'compile',
}
