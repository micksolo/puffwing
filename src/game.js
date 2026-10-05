import { Terrain } from './terrain.js'
import { stepBird, BIRD_R } from './physics.js'

export const REC_PERIOD = 0.15
export const DAY_LENGTH = 60
export const DAY_MAX = 75

export class Run {
  constructor({ seed, mode, ghost }) {
    this.terrain = new Terrain(seed)
    this.mode = mode
    this.ghost = ghost || null
    let sx = 2
    let best = -1
    for (let x = 0; x <= 800; x += 5) {
      if (this.terrain.slope(x) >= 0) continue
      if (this.terrain.slope(x + 10) >= 0) continue
      let s = 0
      for (let k = 0; k <= 60; k += 5) s += Math.max(0, -this.terrain.slope(x + k))
      if (s > best) {
        best = s
        sx = x
      }
    }
    this.bird = { x: sx, y: this.terrain.height(sx) + 12, vx: 18, vy: 0, grounded: false }
    this.acc = 0
    this.time = 0
    this.dayLeft = DAY_LENGTH
    this.coins = 0
    this.perfects = 0
    this.combo = 0
    this.maxCombo = 0
    this.fever = false
    this.feverT = 0
    this.taken = new Set()
    this.rec = [this.bird.x, this.bird.y]
    this.recAcc = 0
    this.events = []
    this.over = false
    this.postNight = 0
    this.slowT = 0
    this.lastPerfect = -10
    this.camX = this.bird.x
    this.camY = this.bird.y + 4
    this.camZ = 26
  }

  get dayT() {
    return Math.max(0, Math.min(1, this.dayLeft / DAY_LENGTH))
  }
  get speed() {
    return Math.hypot(this.bird.vx, this.bird.vy)
  }
  get distance() {
    return Math.max(0, Math.floor(this.bird.x))
  }
  get score() {
    return this.distance + this.coins * 50 + this.perfects * 100 + this.maxCombo * 25
  }

  drainEvents() {
    const e = this.events
    this.events = []
    return e
  }

  update(dt, hold) {
    if (this.over) return
    this.acc += Math.min(dt, 0.1)
    const h = 1 / 120
    let guard = 0
    while (this.acc >= h && guard++ < 12 && !this.over) {
      this.step(h, hold)
      this.acc -= h
    }
    if (this.acc > h) this.acc = 0
  }

  step(dt, hold) {
    const b = this.bird
    const ev = {}
    stepBird(b, hold, this.terrain, dt, ev)
    if (ev.landing) this.handleLanding(ev.landing)
    this.collectCoins()
    this.checkStuck(dt)
    this.time += dt
    this.recAcc += dt
    if (this.recAcc >= REC_PERIOD && this.time < 300) {
      this.recAcc = 0
      this.rec.push(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10)
    }
    if (this.dayLeft > 0) {
      this.dayLeft -= dt
      if (this.dayLeft <= 0) {
        this.dayLeft = 0
        this.events.push({ type: 'night' })
      }
    } else {
      this.postNight += dt
      if ((b.grounded && this.speed < 4) || this.postNight > 12) this.finish()
    }
    if (this.fever) {
      this.feverT -= dt
      if (this.feverT <= 0) {
        this.fever = false
        this.events.push({ type: 'feverEnd' })
      }
    }
    this.updateCamera(dt)
  }

  handleLanding(l) {
    const b = this.bird
    const speed = Math.hypot(l.vx, l.vy)
    const dirTh = Math.atan2(l.vy, l.vx)
    let diff = dirTh - Math.atan(l.slope)
    if (diff > Math.PI) diff -= Math.PI * 2
    if (diff < -Math.PI) diff += Math.PI * 2
    const perfect =
      l.slope < -0.06 && speed > 14 && Math.abs(diff) < 0.5 && (l.airT || 0) > 0.45 && this.time - this.lastPerfect > 0.75
    if (perfect) {
      const sp = Math.max(speed, 1)
      const f = Math.min(sp + 5, 55) / sp
      b.vx *= f
      b.vy *= f
      this.perfects++
      this.combo++
      this.maxCombo = Math.max(this.maxCombo, this.combo)
      if (this.dayLeft > 0) this.dayLeft = Math.min(DAY_MAX, this.dayLeft + 0.3)
      if (this.combo >= 3 && !this.fever) this.events.push({ type: 'fever' })
      if (this.combo >= 3) this.fever = true
      this.feverT = 14
      this.lastPerfect = this.time
      this.events.push({ type: 'perfect', combo: this.combo, x: b.x, y: b.y })
    } else if (l.vn < -15 || Math.abs(diff) > 1.15) {
      b.vx *= 0.9
      b.vy *= 0.9
      this.combo = 0
      if (this.fever) {
        this.fever = false
        this.events.push({ type: 'feverEnd' })
      }
      this.events.push({ type: 'bump', x: b.x, y: b.y })
    } else {
      this.combo = 0
    }
  }

  collectCoins() {
    const b = this.bird
    const r2 = this.fever ? 10 : 2.6
    const list = this.terrain.coinArcsInRange(b.x - 4, b.x + 4)
    for (const c of list) {
      if (this.taken.has(c.id)) continue
      const dx = c.x - b.x
      const dy = c.y - b.y
      if (dx * dx + dy * dy < r2) {
        this.taken.add(c.id)
        this.coins++
        if (this.dayLeft > 0) this.dayLeft = Math.min(DAY_MAX, this.dayLeft + 0.1)
        this.events.push({ type: 'coin', x: c.x, y: c.y })
      }
    }
  }

  ghostPos() {
    const rec = this.ghost && this.ghost.replay
    if (!rec || rec.length < 4) return null
    const n = rec.length / 2
    const f = this.time / REC_PERIOD
    const i = Math.floor(f)
    if (i + 1 >= n) return { x: rec[(n - 1) * 2], y: rec[(n - 1) * 2 + 1], done: true }
    const fr = Math.min(1, Math.max(0, f - i))
    const x0 = rec[i * 2]
    const y0 = rec[i * 2 + 1]
    const x1 = rec[(i + 1) * 2]
    const y1 = rec[(i + 1) * 2 + 1]
    return { x: x0 + (x1 - x0) * fr, y: y0 + (y1 - y0) * fr, done: false }
  }

  checkStuck(dt) {
    const b = this.bird
    if (this.dayLeft > 0 && b.grounded && this.speed < 3) {
      this.slowT += dt
      if (this.slowT > 1.8) {
        this.slowT = -5
        b.vx = Math.max(b.vx, 12)
        this.events.push({ type: 'breeze', x: b.x, y: b.y })
      }
    } else if (this.slowT > 0) {
      this.slowT = 0
    }
  }

  updateCamera(dt) {
    const b = this.bird
    const tx = b.x + Math.min(Math.max(b.vx, 0), 45) * 0.22 + 5
    const ty = b.y + 4
    const tz = 28 + Math.min(this.speed * 0.12, 7)
    this.camX += (tx - this.camX) * Math.min(1, 6 * dt)
    this.camY += (ty - this.camY) * Math.min(1, 3 * dt)
    this.camZ += (tz - this.camZ) * Math.min(1, 2 * dt)
  }

  finish() {
    if (this.over) return
    this.over = true
    this.events.push({ type: 'end' })
  }
}
