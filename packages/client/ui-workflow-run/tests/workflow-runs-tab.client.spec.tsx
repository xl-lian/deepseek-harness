// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkflowRunOutlineEntry } from '@deepseek-ai/dsh-workflow-run-outline/client'
import { WorkflowRunsTab, type WorkflowRunsTabProps } from '../src/client/WorkflowRunsTab.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function entry(overrides: Partial<WorkflowRunOutlineEntry> = {}): WorkflowRunOutlineEntry {
  return {
    runId: 'run-1',
    name: 'audit',
    seq: 3,
    startedAt: 1_000,
    interrupted: false,
    members: { started: 3, completed: 2, failed: 1, cancelled: 0 },
    metrics: {},
    turn: 1,
    ...overrides,
  } as WorkflowRunOutlineEntry
}

function props(runs: readonly WorkflowRunOutlineEntry[] | undefined): WorkflowRunsTabProps {
  return {
    useProjection: vi.fn().mockReturnValue(runs) as WorkflowRunsTabProps['useProjection'],
    t: makeTranslate(zh),
  } as WorkflowRunsTabProps
}

function row(name: string): HTMLElement {
  return screen.getByText(name).closest('tr') as HTMLElement
}

describe('WorkflowRunsTab', () => {
  it.each([[undefined], [[]]])('shows the empty state for %j', (runs) => {
    render(<WorkflowRunsTab {...props(runs)} />)
    expect(screen.getByText('此会话还没有工作流运行')).toBeTruthy()
  })

  it('renders one row per run with each terminal state', () => {
    render(<WorkflowRunsTab {...props([
      entry({ runId: 'a' as never, name: 'done', stopReason: 'completed', endedAt: 61_000, currentPhase: 'Verify' }),
      entry({ runId: 'b' as never, name: 'broken', stopReason: 'error', endedAt: 2_000 }),
      entry({ runId: 'c' as never, name: 'stopped', stopReason: 'cancelled', endedAt: 2_000 }),
      entry({ runId: 'd' as never, name: 'lost', interrupted: true }),
    ])} />)
    expect(row('done').getAttribute('data-run-state')).toBe('completed')
    expect(row('done').textContent).toContain('Verify')
    expect(row('done').textContent).toContain('1分0秒')
    expect(row('done').textContent).toContain('2/3')
    expect(row('broken').getAttribute('data-run-state')).toBe('failed')
    expect(row('stopped').getAttribute('data-run-state')).toBe('cancelled')
    expect(row('lost').getAttribute('data-run-state')).toBe('interrupted')
    expect(row('lost').textContent).toContain('–')
  })

  it('compares metrics across runs with deltas and a trend per name', () => {
    const metric = (latest: number) => ({ latest, min: latest, max: latest, count: 1 })
    const { container } = render(<WorkflowRunsTab {...props([
      entry({ runId: 'a' as never, name: 'first', stopReason: 'completed', endedAt: 2_000, metrics: { loss: metric(2), flat: metric(1) } }),
      entry({ runId: 'b' as never, name: 'second', stopReason: 'completed', endedAt: 2_000, metrics: { once: metric(9) } }),
      entry({ runId: 'c' as never, name: 'third', stopReason: 'completed', endedAt: 2_000, metrics: { loss: metric(1.5), flat: metric(1) } }),
      entry({ runId: 'd' as never, name: 'fourth', stopReason: 'completed', endedAt: 2_000, metrics: { loss: metric(4) } }),
    ])} />)
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['运行', '状态', '时长', '成员', 'loss', 'flat', 'once'])
    expect(row('third').textContent).toContain('1.5-0.5')
    expect(row('fourth').textContent).toContain('4+2.5')
    expect(row('second').textContent).toContain('9')
    expect(row('first').querySelector('[title="2"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'loss 的趋势' })).toBeTruthy()
    expect(container.querySelectorAll('[data-metric-sparkline]')).toHaveLength(2)
    expect(container.querySelector('[aria-label="flat 的趋势"] polyline')?.getAttribute('points')).toBe('0.0,7.0 48.0,7.0')
  })

  it('ticks while a run is live', () => {
    vi.useFakeTimers({ now: 3_000 })
    render(<WorkflowRunsTab {...props([entry()])} />)
    expect(row('audit').getAttribute('data-run-state')).toBe('running')
    expect(row('audit').textContent).toContain('2秒')
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(row('audit').textContent).toContain('4秒')
  })
})
