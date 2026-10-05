import { hash01 } from './rng.js'

// Cosine segments between hill keys. Slope is zero at every key, so peaks
// and valleys meet, and the slope never jumps (C1).
export const HILL_SPAN = 64

function difficulty(x) {
  const t = Math.max(0, Math.min(1, (x - 220) / 500))
  return t * t * (3 - 2 * t)
}

function ampAt(x) {
  // The opening grade stays under 0.2. Later hills pass 0.35.
  return 3.15 + difficulty(x) * 9.4
}

export class Terrain {
  constructor(seed) {
    this.seed = seed >>> 0
  }
  keyY(i) {
    const n = i | 0
    // The same gentle opener on every seed: a downhill, then a rise.
    if (n <= 0) return 3.3
    if (n === 1) return -3.5
    if (n === 2) return 2.6
    const amp = ampAt(n * HILL_SPAN)
    return (hash01(this.seed, n, 11) * 2 - 1) * amp
  }
  height(x) {
    const xx = Math.max(0, x)
    const u = xx / HILL_SPAN
    const i = Math.floor(u)
    const t = u - i
    const y0 = this.keyY(i)
    const y1 = this.keyY(i + 1)
    const s = (1 - Math.cos(Math.PI * t)) / 2
    return y0 + (y1 - y0) * s
  }
  slope(x) {
    const xx = Math.max(0, x)
    const u = xx / HILL_SPAN
    const i = Math.floor(u)
    const t = u - i
    const y0 = this.keyY(i)
    const y1 = this.keyY(i + 1)
    return (y1 - y0) * (Math.PI / (2 * HILL_SPAN)) * Math.sin(Math.PI * t)
  }
  coinArcsInRange(x0, x1) {
    const res = []
    const i0 = Math.floor(x0 / 23)
    const i1 = Math.ceil(x1 / 23)
    for (let i = i0; i <= i1; i++) {
      if (hash01(this.seed, i, 101) >= 0.34) continue
      const bx = i * 23 + 4
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
