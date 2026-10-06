import { hash01 } from './rng.js'

// Cosine segments between hill keys. Slope is zero at every key, so peaks
// and valleys meet, and the slope never jumps (C1).
export const HILL_SPAN = 80

// The same opening on every seed. A short warm-up, then a tall ramp,
// two mid hills, and a deep wow canyon. Knots are {x, y}. Widths vary
// so a downslope can be long and the ramp after it can stay gentle
// enough for a hold-and-release to clear it. Slope is still zero at
// every knot.
export const OPENING_KNOTS = [
  // Warm-up. Modest downhill, small ramp, landing on the next downslope.
  { x: 0, y: 4.5 },
  { x: 34, y: 0.5 },
  { x: 62, y: 5 },
  { x: 112, y: 5 },
  { x: 176, y: -20 },
  // Big ramp. The rise is long enough that the bird leaves before the
  // lip, and the ground under the arc stays low through the landing face.
  { x: 236, y: -12 },
  { x: 300, y: -32 },
  { x: 360, y: -26 },
  { x: 424, y: -52 },
  { x: 458, y: -68 },
  // First mid hill.
  { x: 496, y: -64 },
  { x: 560, y: -84 },
  { x: 650, y: -92 },
  { x: 690, y: -110 },
  { x: 736, y: -104 },
  // Second mid, stretching into the wow ramp.
  { x: 860, y: -140 },
  { x: 1005, y: -250 },
  { x: 1055, y: -242 },
  // Wow canyon. The landing face is a downslope.
  { x: 1170, y: -305 },
  { x: 1255, y: -345 },
  { x: 1335, y: -370 }
]

export const OPENING_END = OPENING_KNOTS[OPENING_KNOTS.length - 1].x

// Coins along the hold-on-downhill, release-on-rise line. Each arc is one
// jump: warm-up, the big hill, two mids, then the wow.
export const GUIDE_ARCS = [
  [
    { x: 65, y: 15.9 },
    { x: 83, y: 19.1 },
    { x: 101, y: 18.2 },
    { x: 119, y: 13.1 },
    { x: 137, y: 4.1 }
  ],
  [
    { x: 216, y: -2.5 },
    { x: 253, y: 6.4 },
    { x: 290, y: 8.4 },
    { x: 326, y: 3.6 },
    { x: 362, y: -7.8 },
    { x: 398, y: -25.9 },
    { x: 434, y: -51.1 }
  ],
  [
    { x: 499, y: -57.8 },
    { x: 535, y: -55.6 },
    { x: 572, y: -59 },
    { x: 609, y: -68.4 },
    { x: 645, y: -83.8 },
    { x: 682, y: -105.8 }
  ],
  [
    { x: 750, y: -102 },
    { x: 805, y: -108.6 },
    { x: 859, y: -127.9 },
    { x: 914, y: -162.5 },
    { x: 968, y: -215.1 }
  ],
  [
    { x: 1039, y: -233.5 },
    { x: 1075, y: -227.6 },
    { x: 1111, y: -233.6 },
    { x: 1147, y: -251.3 },
    { x: 1183, y: -280.8 },
    { x: 1219, y: -322.3 }
  ]
]

function difficulty(x) {
  const t = Math.max(0, Math.min(1, (x - 220) / 500))
  return t * t * (3 - 2 * t)
}

function ampAt(x) {
  // Later hills still pass a 0.35 grade. The opening is authored above.
  return 3.15 + difficulty(x) * 11.5
}

function cosineHeight(y0, y1, t) {
  const s = (1 - Math.cos(Math.PI * t)) / 2
  return y0 + (y1 - y0) * s
}

function cosineSlope(y0, y1, w, t) {
  if (w <= 0) return 0
  return (y1 - y0) * (Math.PI / (2 * w)) * Math.sin(Math.PI * t)
}

export class Terrain {
  constructor(seed) {
    this.seed = seed >>> 0
  }
  seedY(i) {
    const n = i | 0
    const floor = OPENING_KNOTS[OPENING_KNOTS.length - 1].y
    if (n <= 0) return floor
    const x = OPENING_END + n * HILL_SPAN
    const amp = ampAt(x)
    const raw = (hash01(this.seed, n + 40, 11) * 2 - 1) * amp
    // Climb out of the wow canyon in a smoothstep, so the first seeded
    // hill is not a wall above the landing.
    const t = Math.min(1, n / 12)
    const s = t * t * (3 - 2 * t)
    return floor * (1 - s) + raw * s
  }
  segment(x) {
    const xx = Math.max(0, x)
    const knots = OPENING_KNOTS
    if (xx < OPENING_END) {
      let i = 0
      const last = knots.length - 2
      while (i < last && xx >= knots[i + 1].x) i++
      const x0 = knots[i].x
      const x1 = knots[i + 1].x
      const w = x1 - x0
      const t = w > 0 ? (xx - x0) / w : 0
      return { y0: knots[i].y, y1: knots[i + 1].y, w, t }
    }
    const u = (xx - OPENING_END) / HILL_SPAN
    const i = Math.floor(u)
    return {
      y0: this.seedY(i),
      y1: this.seedY(i + 1),
      w: HILL_SPAN,
      t: u - i
    }
  }
  height(x) {
    const s = this.segment(x)
    return cosineHeight(s.y0, s.y1, s.t)
  }
  slope(x) {
    const s = this.segment(x)
    return cosineSlope(s.y0, s.y1, s.w, s.t)
  }
  coinArcsInRange(x0, x1) {
    const res = []
    for (let a = 0; a < GUIDE_ARCS.length; a++) {
      const arc = GUIDE_ARCS[a]
      for (let j = 0; j < arc.length; j++) {
        const c = arc[j]
        if (c.x < x0 - 2 || c.x > x1 + 2) continue
        res.push({ id: 'g' + a + ':' + j, x: c.x, y: c.y })
      }
    }
    const i0 = Math.floor(x0 / 23)
    const i1 = Math.ceil(x1 / 23)
    for (let i = i0; i <= i1; i++) {
      const bx = i * 23 + 4
      if (bx < OPENING_END) continue
      if (hash01(this.seed, i, 101) >= 0.34) continue
      for (let j = 0; j < 6; j++) {
        const cx = bx + j * 2.4
        const cy = this.height(cx) + 4.6 + 2.6 * Math.sin((j / 5) * Math.PI)
        res.push({ id: i + ':' + j, x: cx, y: cy })
      }
    }
    return res
  }
  decorInRange(x0, x1) {
    const res = []
    const i0 = Math.floor(x0 / 7)
    const i1 = Math.ceil(x1 / 7)
    for (let i = i0; i <= i1; i++) {
      if (hash01(this.seed, i, 211) > 0.5) continue
      const x = i * 7 + hash01(this.seed, i, 307) * 5
      const y = this.height(x)
      if (y < -11) continue
      if (Math.abs(this.slope(x)) > 0.45) continue
      const t = hash01(this.seed, i, 401)
      let type = 'tree'
      if (t > 0.62 && t <= 0.85) type = 'flower'
      else if (t > 0.85 && t <= 0.93) type = 'rock'
      else if (t > 0.93 && t <= 0.97) type = 'windmill'
      else if (t > 0.97) type = 'house'
      res.push({
        id: i,
        type,
        x,
        y,
        scale: 0.8 + hash01(this.seed, i, 503) * 0.6,
        rot: hash01(this.seed, i, 601) * Math.PI * 2
      })
    }
    return res
  }
}
