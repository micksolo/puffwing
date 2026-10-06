import { hash01 } from './rng.js'

// Cosine segments between hill keys. Slope is zero at every key, so peaks
// and valleys meet, and the slope never jumps (C1).
export const HILL_SPAN = 80

// The same opening on every seed. A gentle lead-in, one ramp into a
// deep face, then a run of moderate hills. Slope is zero at every knot.
const OPENING_HEAD = [
  { x: 0, y: 6 },
  { x: 36, y: 4.5 },
  { x: 90, y: -14 },
  { x: 150, y: -20 },
  { x: 190, y: -4 },
  { x: 376, y: -190 }
]

function moderateHills(knots) {
  let x = knots[knots.length - 1].x
  let y = knots[knots.length - 1].y
  let down = false
  for (let i = 0; i < 48; i++) {
    x += 64
    y += down ? -18 : 14
    knots.push({ x, y })
    down = !down
  }
  return knots
}

export const OPENING_KNOTS = moderateHills(OPENING_HEAD.map(k => ({ x: k.x, y: k.y })))

export const OPENING_END = OPENING_KNOTS[OPENING_KNOTS.length - 1].x

// Coins along the hold-on-downhill, release-on-rise line. The first arc is
// the opening face; the second is the hill after it.
export const GUIDE_ARCS = [
  [
    { x: 176, y: -7.5 },
    { x: 198, y: -0.1 },
    { x: 220, y: -3 },
    { x: 242, y: -16.2 },
    { x: 264, y: -39.3 },
    { x: 286, y: -72.6 },
    { x: 308, y: -116.4 }
  ],
  [
    { x: 416, y: -179.5 },
    { x: 438, y: -173.7 },
    { x: 461, y: -170.9 },
    { x: 483, y: -170.9 },
    { x: 505, y: -173.8 },
    { x: 528, y: -179.5 }
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

function cosineCurvature(y0, y1, w, t) {
  if (w <= 0) return 0
  const yp = cosineSlope(y0, y1, w, t)
  const ypp = (y1 - y0) * (Math.PI * Math.PI) / (2 * w * w) * Math.cos(Math.PI * t)
  return ypp / Math.pow(1 + yp * yp, 1.5)
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
  curvature(x) {
    const s = this.segment(x)
    return cosineCurvature(s.y0, s.y1, s.w, s.t)
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
