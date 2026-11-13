import { describe, expect, it } from 'vitest'
import { arcConnector, chordConnector, cyclicPairs, RING_SIZE, ringPercent, ringSlots } from '../src/client/ring.ts'

describe('ring geometry', () => {
  it('places the first item at 12 o\'clock and the rest clockwise', () => {
    const slots = ringSlots(['a', 'b', 'c', 'd'])
    expect(slots.map(slot => slot.item)).toEqual(['a', 'b', 'c', 'd'])
    const [top, right, bottom, left] = slots.map(slot => slot.point)
    expect(top?.x).toBeCloseTo(RING_SIZE / 2)
    expect(top?.y).toBeLessThan(RING_SIZE / 2)
    expect(right?.x).toBeGreaterThan(RING_SIZE / 2)
    expect(bottom?.y).toBeGreaterThan(RING_SIZE / 2)
    expect(left?.x).toBeLessThan(RING_SIZE / 2)
    expect(top === undefined ? undefined : ringPercent(top)).toEqual({ left: '50%', top: '12.5%' })
  })

  it('pairs each item with its successor and closes the ring', () => {
    expect(cyclicPairs([1, 2, 3])).toEqual([[1, 2], [2, 3], [3, 1]])
    expect(cyclicPairs([])).toEqual([])
  })

  it('draws a visible clockwise arc between every pair of the seven stages', () => {
    const pairs = cyclicPairs(ringSlots(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']))
    for (const [from, to] of pairs) {
      const arc = arcConnector(from.point, to.point)
      expect(arc?.line).toMatch(/^M[\d.]+ [\d.]+A180 180 0 0 1 [\d.]+ [\d.]+$/)
      expect(arc?.arrow).toMatch(/Z$/)
    }
  })

  it('returns no arc when two node boxes overlap', () => {
    const [first, second] = ringSlots(Array.from({ length: 40 }, (_, index) => index))
    expect(first !== undefined && second !== undefined ? arcConnector(first.point, second.point) : 'missing').toBeUndefined()
  })

  it('draws the repair chord through the ring interior', () => {
    const slots = ringSlots(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'])
    const engineer = slots[2]
    const verifier = slots[3]
    expect(engineer).toBeDefined()
    expect(verifier).toBeDefined()
    if (engineer === undefined || verifier === undefined) return
    const chord = chordConnector(verifier.point, engineer.point)
    expect(chord.line).toMatch(/^M[\d.]+ [\d.]+Q[\d.]+ [\d.]+ [\d.]+ [\d.]+$/)
    const distance = Math.hypot(chord.label.x - RING_SIZE / 2, chord.label.y - RING_SIZE / 2)
    expect(distance).toBeLessThan(180)
  })
})
