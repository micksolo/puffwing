export const G = -24
export const HOLD_MULT = 3
export const BIRD_R = 0.9
export const MAX_SPEED = 55

export function stepBird(b, hold, terrain, dt, ev) {
  const g = G * (hold ? HOLD_MULT : 1)
  if (!b.grounded) {
    b.vy += g * dt
    b.vx -= b.vx * 0.02 * dt
  }
  b.x += b.vx * dt
  b.y += b.vy * dt
  const gy = terrain.height(b.x) + BIRD_R
  if (b.y <= gy) {
    const slope = terrain.slope(b.x)
    const th = Math.atan(slope)
    const c = Math.cos(th)
    const s = Math.sin(th)
    const wasAir = !b.grounded
    const oldVx = b.vx
    const oldVy = b.vy
    let vt = b.vx * c + b.vy * s
    const vn = -b.vx * s + b.vy * c
    b.y = gy
    b.grounded = true
    if (wasAir && vn < -0.5) {
      ev.landing = { slope, vt, vn, vx: oldVx, vy: oldVy, airT: b.airT || 0 }
    }
    b.airT = 0
    const assist = hold && Math.abs(vt) < 15
    vt += (assist ? G : g) * s * dt
    vt -= vt * 0.03 * dt
    if (assist) vt += 26 * dt
    b.vx = vt * c
    b.vy = vt * s
  } else {
    b.grounded = false
    b.airT = (b.airT || 0) + dt
  }
  const sp = Math.hypot(b.vx, b.vy)
  if (sp > MAX_SPEED) {
    b.vx *= MAX_SPEED / sp
    b.vy *= MAX_SPEED / sp
  }
}
