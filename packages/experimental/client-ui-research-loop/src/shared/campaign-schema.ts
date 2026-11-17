/**
 * Zod schemas for the campaign part of the notebook projection: the persisted
 * fold state and the bounded browser view. Host only; the client bundle must not import this module's values.
 */

import { z } from 'zod'
import type { CampaignState, CampaignView } from './campaign-types.ts'

const statusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'interrupted', 'blocked'])
const stageIdSchema = z.enum(['scout', 'hypotheses', 'engineer', 'verifier', 'statistician', 'decide', 'report'])
const verdictSchema = z.enum(['pass', 'warn', 'fail'])
const checkStatusSchema = z.enum(['pass', 'warn', 'fail', 'skip'])

const checkSchema = z.object({
  layer: z.string(),
  checkId: z.string(),
  status: checkStatusSchema,
  severity: z.string().optional(),
  summary: z.string().optional(),
})

const memberSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.string(),
  agent: z.string(),
  kind: z.enum(['workflow', 'tool', 'command']),
  status: statusSchema,
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  outcome: z.string().optional(),
  childId: z.string().optional(),
  callId: z.string().optional(),
  summary: z.string().optional(),
  output: z.string().optional(),
  verdict: verdictSchema.optional(),
  repairable: z.boolean().optional(),
  runIds: z.array(z.string()).optional(),
  metrics: z.record(z.string(), z.number()).optional(),
  plan: z.string().optional(),
  files: z.array(z.string()).optional(),
  trust: z.string().optional(),
  blockingFailures: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  checks: z.array(checkSchema).optional(),
  metricsVerified: z.record(z.string(), z.number()).optional(),
  statusDetail: z.string().optional(),
  notes: z.string().optional(),
  repaired: z.boolean().optional(),
})

const stageSchema = z.object({
  id: stageIdSchema,
  status: statusSchema,
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  summary: z.string().optional(),
  verdict: verdictSchema.optional(),
  members: z.array(memberSchema),
  explicit: z.object({ status: statusSchema, seq: z.number() }).optional(),
})

const cvSchema = z.object({
  strategy: z.string().optional(),
  groupColumn: z.string().optional(),
  timeColumn: z.string().optional(),
  reason: z.string().optional(),
})

const evidenceSchema = z.object({
  sourceType: z.string().optional(),
  url: z.string().optional(),
  quote: z.string().optional(),
  claim: z.string().optional(),
  support: z.string().optional(),
})

const scoutSchema = z.object({
  summary: z.string(),
  metric: z.string().optional(),
  taskType: z.string().optional(),
  rowsTrain: z.number().optional(),
  columns: z.number().optional(),
  cv: cvSchema.optional(),
  baselinePresent: z.boolean().optional(),
  risks: z.array(z.string()),
  evidence: z.array(evidenceSchema),
})

const hypothesisSchema = z.object({
  hypothesisId: z.string().optional(),
  experimentId: z.string().optional(),
  statement: z.string(),
  prediction: z.string().optional(),
  rationale: z.string().optional(),
  design: z.string().optional(),
  seeds: z.array(z.number()).optional(),
  expectedDelta: z.number().optional(),
  cost: z.string().optional(),
  leakageRisk: z.string().optional(),
  cvDesign: z.string().optional(),
  operator: z.string().optional(),
  family: z.string().optional(),
})

const ensembleSchema = z.object({
  built: z.boolean(),
  members: z.number().optional(),
  runs: z.number().optional(),
  scores: z.array(z.number()).optional(),
  reason: z.string().optional(),
})

const l3Schema = z.object({
  roundSummary: z.string().optional(),
  seedVariance: z.string().optional(),
  multipleComparisons: z.string().optional(),
  budgetFairness: z.string().optional(),
  stopRecommended: z.boolean().optional(),
  notes: z.string().optional(),
})

const candidateSchema = z.object({
  runId: z.string(),
  verifiedMean: z.number().optional(),
  verifiedSd: z.number().optional(),
  seeds: z.number().optional(),
  distinctPredictions: z.number().optional(),
  note: z.string().optional(),
  costUsd: z.number().optional(),
  rank: z.number().optional(),
})

const decisionSchema = z.object({
  chosenRunId: z.string().optional(),
  rationaleCode: z.string().optional(),
  eliminated: z.array(z.object({ runId: z.string(), reason: z.string() })),
  candidates: z.array(candidateSchema),
  budgetUsed: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
})

const reportIssueSchema = z.object({
  line: z.number().optional(),
  token: z.string().optional(),
  text: z.string().optional(),
  kind: z.string().optional(),
})

const reportSchema = z.object({
  path: z.string().optional(),
  ok: z.boolean().optional(),
  strict: z.boolean().optional(),
  issues: z.array(reportIssueSchema),
})

const verifiedRunSchema = z.object({
  runId: z.string(),
  label: z.string().optional(),
  value: z.number().optional(),
  seed: z.number().optional(),
})

const designSchema = z.object({
  baselineRunId: z.string().optional(),
  baselineValue: z.number().optional(),
  best: verifiedRunSchema.optional(),
  delta: z.number().optional(),
  multipleComparisons: z.number().optional(),
  distinctOofTotal: z.number().optional(),
  verifiedRuns: z.array(verifiedRunSchema),
})

const roundSchema = z.object({
  id: z.string(),
  roundId: z.string().optional(),
  mode: z.string().optional(),
  strategy: z.enum(['exploit', 'explore']).optional(),
  strategyReason: z.string().optional(),
  ensemble: ensembleSchema.optional(),
  status: statusSchema,
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  anchor: z.object({ kind: z.enum(['workflow', 'direct']), id: z.string() }),
  suppressedAnchors: z.array(z.string()),
  stages: z.record(stageIdSchema, stageSchema),
  workflow: z.object({
    callId: z.string().optional(),
    runId: z.string().optional(),
    stopReason: z.string().optional(),
    error: z.string().optional(),
    startedAt: z.number().optional(),
  }).optional(),
  scout: scoutSchema.optional(),
  hypotheses: z.array(hypothesisSchema).optional(),
  l3: l3Schema.optional(),
  decision: decisionSchema.optional(),
  report: reportSchema.optional(),
  design: designSchema.optional(),
})

const callSchema = z.object({
  roundId: z.string(),
  purposes: z.array(z.enum([
    'workflow',
    'round-begin',
    'round-stage',
    'round-end',
    'decide',
    'report',
    'scout',
    'hypothesis',
    'engineer',
    'verifier',
    'statistician',
    'ignore',
  ])),
  stageName: z.string().optional(),
  roundOutcome: z.string().optional(),
})

/** Persisted campaign fold state. */
export const campaignStateSchema: z.ZodType<CampaignState> = z.object({
  rounds: z.array(roundSchema),
  calls: z.record(z.string(), callSchema),
  runs: z.record(z.string(), z.string()),
  activeRoundId: z.string().optional(),
})

/** Campaign rounds sent to the browser; members carry no explicit stage overrides. */
export const campaignViewSchema: z.ZodType<CampaignView> = z.object({
  rounds: z.array(roundSchema.omit({ stages: true }).extend({
    stages: z.record(stageIdSchema, stageSchema.omit({ explicit: true })),
  })),
  activeRoundId: z.string().optional(),
})
