import { describe, expect, it } from 'vitest'
import { SCIENCE_WORKFLOWS, classifyToolCall, sagentInvocations } from '../src/shared/classify.ts'

describe('sagentInvocations', () => {
  it('finds wrapped and batched commands', () => {
    const command = [
      'cd /ws && env FOO=1 sagent -w /ws round begin --mode quick --json',
      'timeout 600 bash -lc "sagent -w /ws decide --round rd-1 --json"',
      'uv run sagent report build --round rd-1 --json; echo done',
    ].join(' && ')
    const subcommands = sagentInvocations(command).map(invocation => invocation.sub.join(' '))
    expect(subcommands).toEqual([
      'round begin --mode quick --json',
      'decide --round rd-1 --json',
      'report build --round rd-1 --json',
    ])
  })

  it('finds path-qualified sagent executables', () => {
    const command = '/Users/me/.venv/bin/sagent -w /ws round begin --mode quick && /Users/me/.local/bin/sa round end'
    expect(sagentInvocations(command).map(invocation => invocation.sub.join(' '))).toEqual([
      'round begin --mode quick',
      'round end',
    ])
  })
})

describe('classifyToolCall', () => {
  it('ignores sagent help requests, which change no state', () => {
    for (const command of ['sagent round close --help', 'sagent -w /ws round begin -h']) {
      expect(classifyToolCall('bash', JSON.stringify({ command }))).toEqual([])
    }
  })

  it('ignores ledger reads, which add no round work', () => {
    for (const command of ['sagent hypothesis list --round rd-1 --json', 'sagent hypothesis show h-1', 'sagent experiment list']) {
      expect(classifyToolCall('bash', JSON.stringify({ command }))).toEqual([])
    }
    expect(classifyToolCall('bash', JSON.stringify({ command: 'sagent hypothesis register --round rd-1' }))[0]?.purpose).toBe('hypothesis')
  })

  it('takes round ids only from literal tokens', () => {
    const roundIds = (command: string): (string | undefined)[] => classifyToolCall('bash', JSON.stringify({ command })).map(entry => entry.roundId)
    expect(roundIds('for r in rd-1 rd-2; do sagent decide --round $r; done')).toEqual([undefined])
    expect(roundIds('sagent round end rd-9 --outcome aborted')).toEqual(['rd-9'])
    expect(roundIds('sagent round end --outcome aborted')).toEqual([undefined])
    const [workflow] = classifyToolCall('workflow', JSON.stringify({ name: 'science-round', args: { roundId: '${ROUND}' } }))
    expect(workflow?.roundId).toBeUndefined()
  })

  it('classifies workflow calls and keeps the round binding', () => {
    const [classification] = classifyToolCall('workflow', JSON.stringify({
      meta: { name: 'kaggle-round' },
      script: '',
      args: { roundId: 'rd-1', mode: 'full' },
    }))
    expect(classification?.purpose).toBe('workflow')
    expect(classification?.roundId).toBe('rd-1')
    expect(classification?.mode).toBe('full')
    expect(classification?.anchors).toBe(false)
  })

  it('labels campaign and round workflows by meta name', () => {
    const [campaign] = classifyToolCall('workflow', JSON.stringify({ meta: { name: 'science-campaign' }, script: '', args: { workspace: '/ws' } }))
    expect(campaign?.purpose).toBe('workflow')
    expect(campaign?.label).toBe('science-campaign')
    expect(campaign?.roundId).toBeUndefined()
    expect([...SCIENCE_WORKFLOWS].sort()).toEqual(['kaggle-round', 'science-campaign', 'science-round'])
  })

  it('ignores unrelated workflows', () => {
    expect(classifyToolCall('workflow', JSON.stringify({
      meta: { name: 'release-audit' },
      script: '',
      args: {},
    }))).toEqual([])
  })

  it('treats round close as the round-ending command', () => {
    const [bash] = classifyToolCall('bash', JSON.stringify({ command: 'sagent -w /ws round close rd-7 --tokens-out 1200 --json' }))
    expect(bash?.purpose).toBe('round-end')
    expect(bash?.roundId).toBe('rd-7')
    expect(bash?.label).toBe('sagent round close')
    const [mcp] = classifyToolCall('mcp__science-agent__sa_round', JSON.stringify({ action: 'close', round_id: 'rd-8' }))
    expect(mcp?.purpose).toBe('round-end')
    expect(mcp?.roundId).toBe('rd-8')
  })

  it('classifies direct subagent tools as stage work', () => {
    const [classification] = classifyToolCall('sa_verifier', '{}')
    expect(classification?.stage).toBe('verifier')
    expect(classification?.role).toBe('sa-verifier')
    expect(classification?.anchors).toBe(true)
  })

  it('classifies bash round and decide commands', () => {
    const classifications = classifyToolCall('bash', JSON.stringify({
      command: 'sagent -w /ws round begin --mode quick --json && sagent -w /ws decide --round rd-1 --json',
    }))
    expect(classifications.map(entry => entry.purpose)).toEqual(['round-begin', 'decide'])
    expect(classifications[1]?.roundId).toBe('rd-1')
  })

  it('classifies MCP science-agent tools by action', () => {
    const [verify] = classifyToolCall('mcp__science-agent__sa_verify', JSON.stringify({ action: 'design', round: 'rd-1' }))
    expect(verify?.purpose).toBe('statistician')
    const [round] = classifyToolCall('mcp__science-agent__sa_round', JSON.stringify({ action: 'stage', stage: 'report', status: 'completed' }))
    expect(round?.purpose).toBe('round-stage')
    expect(round?.stageName).toBe('report')
    expect(round?.stageStatus).toBe('completed')
  })

  it('ignores unrelated tools and preflight commands', () => {
    expect(classifyToolCall('read', '{}')).toEqual([])
    expect(classifyToolCall('bash', JSON.stringify({ command: 'sagent doctor --json' }))).toEqual([])
  })
})
