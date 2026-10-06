import { hash01 } from './rng.js'

// Cosine segments between hill keys. Slope is zero at every key, so peaks
// and valleys meet, and the slope never jumps (C1).
export const HILL_SPAN = 80

// The same opening on every seed. A short warm-up, a tall ramp, a long
// mid descent, a low roller, then the wow canyon. Knots are {x, y}.
// Widths vary so a downslope can be long and the ramp after it can stay
// gentle enough for a hold-and-release to clear it. Slope is still zero
// at every knot.
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
  { x: 492, y: -63 },
  { x: 640, y: -105 },
  { x: 780, y: -210 },
  { x: 880, y: -216 },
  { x: 960, y: -200 },
  { x: 1050, y: -255 },
  { x: 1360, y: -425 },
  { x: 1520, y: -500 },
  { x: 1620, y: -530 }
]

export const OPENING_END = OPENING_KNOTS[OPENING_KNOTS.length - 1].x

// Coins along the hold-on-downhill, release-on-rise line. Each arc is one
// jump: warm-up, the big hill, two mids, then the wow.
export const GUIDE_ARCS = [
  [
    { x: 41, y: 5.5 },
    { x: 63, y: 15.4 },
    { x: 86, y: 19.1 },
    { x: 108, y: 16.6 },
    { x: 130, y: 7.8 },
    { x: 152, y: -7.2 }
  ],
  [
    { x: 187, y: -15.2 },
    { x: 209, y: -5.3 },
    { x: 232, y: 1.9 },
    { x: 254, y: 6.6 },
    { x: 276, y: 8.7 },
    { x: 299, y: 8.3 },
    { x: 321, y: 5.2 },
    { x: 344, y: -0.4 },
    { x: 366, y: -8.6 },
    { x: 388, y: -19.3 },
    { x: 412, y: -33.2 },
    { x: 434, y: -49.9 }
  ],
  [
    { x: 502, y: -59.3 },
    { x: 525, y: -58.3 },
    { x: 548, y: -59.6 },
    { x: 571, y: -63.3 },
    { x: 594, y: -69.2 },
    { x: 617, y: -77.3 },
    { x: 640, y: -88.0 },
    { x: 662, y: -100.8 },
    { x: 684, y: -116.2 },
    { x: 707, y: -135.4 },
    { x: 730, y: -158.6 },
    { x: 753, y: -186.0 }
  ],
  [
    { x: 890, y: -211.4 },
    { x: 913, y: -202.2 },
    { x: 936, y: -195.6 },
    { x: 958, y: -191.6 },
    { x: 981, y: -190.2 },
    { x: 1004, y: -191.3 },
    { x: 1027, y: -195.0 },
    { x: 1049, y: -201.3 },
    { x: 1072, y: -210.1 },
    { x: 1095, y: -221.5 },
    { x: 1118, y: -235.8 },
    { x: 1140, y: -252.9 },
    { x: 1162, y: -272.9 },
    { x: 1184, y: -296.8 },
    { x: 1207, y: -326.0 }
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
