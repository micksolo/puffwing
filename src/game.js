import { Terrain } from './terrain.js'
import { stepBird, BIRD_R } from './physics.js'

export const REC_PERIOD = 0.15
export const DAY_LENGTH = 60
export const DAY_MAX = 75

// Portrait windows have a narrow horizontal view, so the camera pulls back.
// The cap keeps a fast, high bird from shrinking to a speck on a phone.
export function frameDistance(camZ, aspect) {
  const a = Math.max(Number(aspect) || 1, 0.36)
  if (a >= 1.05) return camZ
  const widen = Math.min(2.05, 0.9 / a)
  return Math.min(camZ * widen, 168)
}

export class Run {
  constructor({ seed, mode, ghost }) {
    this.terrain = new Terrain(seed)
    this.mode = mode
    this.ghost = ghost || null
    // Start on the gentle opening, on the first real downhill, a little above
    // the ground so the diagonal dive is visible before the hill catches it.
    let sx = 10
    for (let x = 4; x <= 150; x += 2) {
      if (this.terrain.slope(x) < -0.05 && this.terrain.slope(x + 18) < -0.04) {
        sx = x
        break
      }
    }
    this.bird = { x: sx, y: this.terrain.height(sx) + 7, vx: 18, vy: 0, grounded: false }
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
    this.endCause = ''
    this.postNight = 0
    this.slowT = 0
    this.lastPerfect = -10
    this.dives = 0
    this.launches = 0
    this.airtime = 0
    this.holdPrev = false
    this.camX = this.bird.x
    this.camY = this.bird.y + 4
    this.camZ = 68
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
    const pressed = !!hold
    if (pressed && !this.holdPrev) this.dives++
    this.holdPrev = pressed
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
    if (!b.grounded) this.airtime += dt
    if (ev.launch) {
      this.launches++
      this.events.push({ type: 'launch', x: b.x, y: b.y })
    }
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
      if ((b.grounded && this.speed < 4) || this.postNight > 12) {
        this.finish(b.grounded && this.speed < 4 ? 'beach' : 'night')
      }
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
    } else if (l.slope > 0.08 && (l.vn < -52 || Math.abs(diff) > 1.35)) {
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
    const alt = Math.max(0, b.y - this.terrain.height(b.x) - 0.9)
    const lead = 12 + Math.min(Math.max(b.vx, 0), 48) * 0.2
    const tx = b.x + lead
    // Sit a little above the bird, and look down into the valley when it climbs.
    const ty = b.y + 2.2 - Math.min(alt, 24) * 0.32
    const tz = 68 + Math.min(this.speed * 0.4, 26) + Math.min(alt * 1.1, 32)
    this.camX += (tx - this.camX) * Math.min(1, 5 * dt)
    this.camY += (ty - this.camY) * Math.min(1, 3 * dt)
    this.camZ += (tz - this.camZ) * Math.min(1, 2.2 * dt)
  }

  finish(cause) {
    if (this.over) return
    this.over = true
    this.endCause = cause || 'beach'
    this.events.push({ type: 'end', cause: this.endCause })
  }
}
