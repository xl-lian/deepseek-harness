/** Rendering fixtures shared by the campaign client specs: a translator and notebook views holding campaign rounds. */

import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en } from '../src/client/locales.ts'
import type { NotebookContentProps } from '../src/client/ResearchLoopView.tsx'
import type { LoopRound } from '../src/shared/campaign-types.ts'
import type { ResearchView } from '../src/shared/schema.ts'

/** English translator that fills `{name}` parameters. */
export const t = ((key: keyof typeof en, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), en[key])) as TranslateNS<'researchLoop'>

/**
 * A notebook view with only campaign rounds.
 * @param rounds - campaign rounds, oldest first.
 * @returns the view; the last round is the active one.
 */
export function campaignView(rounds: readonly LoopRound[]): ResearchView {
  const active = rounds[rounds.length - 1]
  return {
    v: 4,
    runs: [],
    papers: [],
    campaign: active === undefined ? { rounds: [] } : { rounds: [...rounds], activeRoundId: active.id },
    agentPreset: 'research',
    skillLoaded: true,
  }
}

const noop = (): void => {}

/**
 * Props of the notebook body for a static render; static rendering runs no effects, so no child Session is retained.
 * @param view - the notebook view.
 * @returns the props.
 */
export function notebookProps(view: ResearchView): NotebookContentProps {
  return {
    view,
    sessionId: 's-1' as SessionId,
    openChild: noop,
    openFile: noop,
    retainChild: (): SessionReference => { throw new Error('static rendering retains no child Session') },
    t,
  }
}
