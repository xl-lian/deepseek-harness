/**
 * Geometry of the Loop view ring, in the units of a square SVG viewBox of
 * `RING_SIZE`. Node buttons are HTML boxes positioned by percentage; arcs and
 * the repair chord leave a gap around each node box so lines never pass under
 * a node.
 */

/** Width and height of the ring viewBox. */
export const RING_SIZE = 480
const CENTER = RING_SIZE / 2
const RADIUS = 180
/** Half of a node box plus clearance, in viewBox units; matches `.rlc-ring-node` (23.5% × 12.5%). */
const HALF_WIDTH = 62
const HALF_HEIGHT = 36
const ARROW_LENGTH = 7
const ARROW_HALF_WIDTH = 4
const STEP = Math.PI / 360

/** One node center on the ring. */
export interface RingPoint {
  readonly x: number
  readonly y: number
  /** Angle in radians, clockwise from 3 o'clock in SVG coordinates. */
  readonly angle: number
}

/** One drawable connector: the line and its arrowhead. */
export interface RingConnector {
  readonly line: string
  readonly arrow: string
}

/** A connector through the ring interior and the point where its label sits. */
export interface RingChord extends RingConnector {
  readonly label: { readonly x: number; readonly y: number }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function pointAt(angle: number): RingPoint {
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle), angle }
}

function insideBox(point: { readonly x: number; readonly y: number }, node: RingPoint): boolean {
  return Math.abs(point.x - node.x) <= HALF_WIDTH && Math.abs(point.y - node.y) <= HALF_HEIGHT
}

function arrowHead(tip: { readonly x: number; readonly y: number }, dx: number, dy: number): string {
  const length = Math.hypot(dx, dy)
  const ux = dx / length
  const uy = dy / length
  const baseX = tip.x - ux * ARROW_LENGTH
  const baseY = tip.y - uy * ARROW_LENGTH
  return `M${round2(tip.x)} ${round2(tip.y)}L${round2(baseX - uy * ARROW_HALF_WIDTH)} ${round2(baseY + ux * ARROW_HALF_WIDTH)}`
    + `L${round2(baseX + uy * ARROW_HALF_WIDTH)} ${round2(baseY - ux * ARROW_HALF_WIDTH)}Z`
}

/** One ring item and its node center. */
export interface RingSlot<T> {
  readonly item: T
  readonly point: RingPoint
}

/**
 * Place items evenly on the ring, the first at 12 o'clock, then clockwise.
 * @param items - items in ring order.
 * @returns one slot per item, in the same order.
 */
export function ringSlots<T>(items: readonly T[]): RingSlot<T>[] {
  return items.map((item, index) => ({ item, point: pointAt(-Math.PI / 2 + (index * 2 * Math.PI) / items.length) }))
}

/**
 * Each item paired with its clockwise successor; the last pairs with the first.
 * @param items - items in ring order.
 * @returns one pair per item, or none for an empty list.
 */
export function cyclicPairs<T>(items: readonly T[]): (readonly [T, T])[] {
  const [first] = items
  if (first === undefined) return []
  const pairs: (readonly [T, T])[] = []
  let previous: T = first
  for (const item of items.slice(1)) {
    pairs.push([previous, item])
    previous = item
  }
  pairs.push([previous, first])
  return pairs
}

/**
 * Node center as CSS percentages of the ring box.
 * @param point - node center.
 * @returns `left` and `top` percentages.
 */
export function ringPercent(point: RingPoint): { readonly left: string; readonly top: string } {
  return { left: `${round2((point.x / RING_SIZE) * 100)}%`, top: `${round2((point.y / RING_SIZE) * 100)}%` }
}

/**
 * Clockwise arc along the ring from one node box to the next, with an arrowhead at the target.
 * @param from - source node; must precede `to` clockwise by less than a full turn.
 * @param to - target node.
 * @returns the connector, or `undefined` when the node boxes leave no visible arc between them.
 */
export function arcConnector(from: RingPoint, to: RingPoint): RingConnector | undefined {
  let end = to.angle
  while (end <= from.angle) end += 2 * Math.PI
  let start = from.angle
  while (start < end && insideBox(pointAt(start), from)) start += STEP
  let stop = end
  while (stop > start && insideBox(pointAt(stop), to)) stop -= STEP
  if (stop - start < STEP * 4) return undefined
  const a = pointAt(start)
  const b = pointAt(stop)
  const large = stop - start > Math.PI ? 1 : 0
  return {
    line: `M${round2(a.x)} ${round2(a.y)}A${RADIUS} ${RADIUS} 0 ${large} 1 ${round2(b.x)} ${round2(b.y)}`,
    arrow: arrowHead(b, -Math.sin(stop), Math.cos(stop)),
  }
}

function innerEdge(node: RingPoint): { readonly x: number; readonly y: number } {
  const dx = CENTER - node.x
  const dy = CENTER - node.y
  const length = Math.hypot(dx, dy)
  const ux = dx / length
  const uy = dy / length
  const distance = Math.min(
    ux === 0 ? Number.POSITIVE_INFINITY : HALF_WIDTH / Math.abs(ux),
    uy === 0 ? Number.POSITIVE_INFINITY : HALF_HEIGHT / Math.abs(uy),
  )
  return { x: node.x + ux * distance, y: node.y + uy * distance }
}

/**
 * Curved chord through the ring interior from one node box to another, with an arrowhead at the target.
 * @param from - source node.
 * @param to - target node.
 * @returns the connector and the curve's control point, used to place its label.
 */
export function chordConnector(from: RingPoint, to: RingPoint): RingChord {
  const a = innerEdge(from)
  const b = innerEdge(to)
  const control = { x: ((a.x + b.x) / 2 + CENTER) / 2, y: ((a.y + b.y) / 2 + CENTER) / 2 }
  return {
    line: `M${round2(a.x)} ${round2(a.y)}Q${round2(control.x)} ${round2(control.y)} ${round2(b.x)} ${round2(b.y)}`,
    arrow: arrowHead(b, b.x - control.x, b.y - control.y),
    label: { x: round2(control.x), y: round2(control.y) },
  }
}
