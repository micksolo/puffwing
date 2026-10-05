import { hash01 } from './rng.js'

function vnoise(x, period, salt, seed) {
  const u = x / period
  const i = Math.floor(u)
  const f = u - i
  const a = hash01(seed, i, salt)
  const b = hash01(seed, i + 1, salt)
  const s = f * f * (3 - 2 * f)
  return (a + (b - a) * s) * 2 - 1
}

export class Terrain {
  constructor(seed) {
    this.seed = seed >>> 0
  }
  height(x) {
    return (
      vnoise(x, 150, 11, this.seed) * 11.5 +
      vnoise(x, 44, 23, this.seed) * 8 +
      vnoise(x, 12, 37, this.seed) * 2.6 -
      8
    )
  }
  slope(x) {
    return this.height(x + 0.5) - this.height(x - 0.5)
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
