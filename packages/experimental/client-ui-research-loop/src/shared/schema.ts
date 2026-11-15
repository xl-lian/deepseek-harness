/**
 * Research loop model shared by the host projection and the browser surfaces.
 * Every type is inferred from its zod schema, so the persisted state, the wire
 * view, and the code that reads them cannot disagree. Values are plain JSON.
 */

import type {} from '@deepseek-ai/dsh-session-projection/types'
import { z } from 'zod'
import { MEMBER_KINDS, VERDICTS } from './constants.ts'

/** Lifecycle of a run, round, or member. */
export const researchStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled'])

/** Lifecycle of a run, round, or member. */
export type ResearchStatus = z.infer<typeof researchStatusSchema>

/** What one workflow member does, read from its label. */
export const memberKindSchema = z.enum(MEMBER_KINDS)

/** What one workflow member does, read from its label. */
export type MemberKind = z.infer<typeof memberKindSchema>

/** The validator's verdict values. */
export const verdictSchema = z.enum(VERDICTS)

/** The validator's verdict values. */
export type ResearchVerdict = z.infer<typeof verdictSchema>

const roleSchema = z.enum(['confirmatory', 'exploratory'])

/** One `agent()` call of a research round. */
export const memberSchema = z.object({
  seq: z.number(),
  label: z.string(),
  kind: memberKindSchema,
  status: researchStatusSchema,
  experimentId: z.string().optional(),
  focusId: z.string().optional(),
  pass: z.number().optional(),
  childId: z.string().optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
})

/** One `agent()` call of a research round. */
export type ResearchMember = z.infer<typeof memberSchema>

/** The run's final write-up member. */
export const writeUpSchema = z.object({
  seq: z.number(),
  status: researchStatusSchema,
  childId: z.string().optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
})

/** One planned experiment as the loop narrated and returned it. */
export const experimentSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  role: roleSchema.optional(),
  /** `ran`, `failed`, or `blocked`, from the loop. */
  outcome: z.string().optional(),
  verdict: verdictSchema.optional(),
  confidence: z.string().optional(),
  unresolved: z.array(z.string()).optional(),
  runIds: z.array(z.string()).optional(),
  reason: z.string().optional(),
  notRunByCap: z.boolean().optional(),
})

/** One planned experiment as the loop narrated and returned it. */
export type ResearchExperiment = z.infer<typeof experimentSchema>

/** One round of one loop invocation. */
export const roundSchema = z.object({
  number: z.number(),
  roundId: z.string().optional(),
  reused: z.boolean().optional(),
  status: researchStatusSchema,
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  retrieval: z.object({ focuses: z.number(), passes: z.number(), enough: z.boolean() }).optional(),
  plan: z.object({ registered: z.boolean(), error: z.string().optional(), snapshot: z.string().optional() }).optional(),
  experiments: z.array(experimentSchema),
  members: z.array(memberSchema),
  decision: z.enum(['continue', 'stop']).optional(),
  reason: z.string().optional(),
  needsHuman: z.string().optional(),
  notes: z.array(z.string()),
})

/** One round of one loop invocation. */
export type ResearchRound = z.infer<typeof roundSchema>

/** One `research-loop` workflow invocation. */
export const runSchema = z.object({
  runId: z.string(),
  callId: z.string().optional(),
  workspace: z.string().optional(),
  status: researchStatusSchema,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  phase: z.string().optional(),
  rounds: z.array(roundSchema),
  writeUp: writeUpSchema.optional(),
  stop: z.object({ reason: z.string(), detail: z.string().optional() }).optional(),
  answer: z.string().optional(),
  notes: z.array(z.string()),
})

/** One `research-loop` workflow invocation. */
export type ResearchRun = z.infer<typeof runSchema>

/** One objection as `sagent research status` classifies it. */
export const objectionSchema = z.object({
  id: z.string(),
  status: z.string(),
  summary: z.string().optional(),
})

/** One registered experiment as `sagent research status` reports it. */
export const ledgerExperimentSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  role: z.string().optional(),
  build: z.string().optional(),
  runs: z.array(z.string()),
  verdict: z.string().optional(),
  confidence: z.string().optional(),
  verdictBy: z.string().optional(),
  evidenceClass: roleSchema.optional(),
  demotedBy: z.array(z.string()),
  flags: z.array(z.string()),
  objections: z.array(objectionSchema),
})

/** One registered experiment as `sagent research status` reports it. */
export type LedgerExperiment = z.infer<typeof ledgerExperimentSchema>

/** One round as `sagent research status` reports it. */
export const ledgerRoundSchema = z.object({
  roundId: z.string(),
  number: z.number().optional(),
  decision: z.string().optional(),
  reason: z.string().optional(),
  registeredPlan: z.object({ path: z.string(), registeredAt: z.string().optional(), changedSince: z.boolean() }).optional(),
  experiments: z.array(ledgerExperimentSchema),
})

/** One round as `sagent research status` reports it. */
export type LedgerRound = z.infer<typeof ledgerRoundSchema>

/** The latest `sagent research status` snapshot seen in the Session. */
export const ledgerSchema = z.object({
  time: z.number(),
  workspace: z.string().optional(),
  question: z.string().optional(),
  sources: z.number().optional(),
  citations: z.number().optional(),
  searches: z.number().optional(),
  rounds: z.array(ledgerRoundSchema),
})

/** The latest `sagent research status` snapshot seen in the Session. */
export type ResearchLedger = z.infer<typeof ledgerSchema>

/** What a pending tool call will contribute when its result arrives. */
export const pendingCallSchema = z.object({
  purpose: z.enum(['loop', 'status']),
  workspace: z.string().optional(),
})

/** The persisted fold state. */
export const researchStateSchema = z.object({
  v: z.literal(1),
  runs: z.array(runSchema),
  calls: z.record(z.string(), pendingCallSchema),
  ledger: ledgerSchema.optional(),
  agentPreset: z.string().nullable(),
  skillLoaded: z.boolean(),
})

/** The persisted fold state. */
export type ResearchState = z.infer<typeof researchStateSchema>

/** The view sent to the browser: the state without pending call bindings. */
export const researchViewSchema = researchStateSchema.omit({ calls: true })

/** The view sent to the browser: the state without pending call bindings. */
export type ResearchView = z.infer<typeof researchViewSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Research loop runs and the latest research status snapshot for one Session. */
    scienceResearchLoop: ResearchView
  }
}
