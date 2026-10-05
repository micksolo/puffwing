export const GLIDE_G = -18
export const HOLD_G = -96
export const BIRD_R = 0.9
export const MAX_SPEED = 64

function capSpeed(b) {
  const sp = Math.hypot(b.vx, b.vy)
  if (sp > MAX_SPEED) {
    b.vx *= MAX_SPEED / sp
    b.vy *= MAX_SPEED / sp
  }
}

// Nose angle in radians. Holding tucks the beak down on the first frame,
// before gravity has moved the bird, so the press is obvious in the air and
// on the ground.
export function diveTilt(vx, vy, hold, grounded) {
  const along = Math.atan2(vy, Math.max(vx, 8))
  const tuck = hold ? (grounded ? 0.72 : 1.05) : 0
  const tilt = along * (hold ? 1 : 0.92) - tuck
  return Math.max(-1.5, Math.min(0.7, tilt))
}

export function stepBird(b, hold, terrain, dt, ev) {
  const g = hold ? HOLD_G : GLIDE_G
  if (!b.grounded) {
    b.vy += g * dt
    if (hold && b.vy > 0) b.vy -= 48 * dt
    b.vx -= b.vx * (hold ? 0.03 : 0.008) * dt
  }
  if (b.launchCd > 0) b.launchCd -= dt

  b.x += b.vx * dt
  b.y += b.vy * dt

  const gy = terrain.height(b.x) + BIRD_R
  if (b.y > gy) {
    b.grounded = false
    b.airT = (b.airT || 0) + dt
    capSpeed(b)
    return
  }

  const slope = terrain.slope(b.x)
  const th = Math.atan(slope)
  const c = Math.cos(th)
  const s = Math.sin(th)
  const wasAir = !b.grounded
  const oldVx = b.vx
  const oldVy = b.vy
  let vt = oldVx * c + oldVy * s
  const vn = -oldVx * s + oldVy * c
  const inbound = Math.hypot(oldVx, oldVy)

  if (wasAir && vn < -0.5) {
    ev.landing = { slope, vt, vn, vx: oldVx, vy: oldVy, airT: b.airT || 0 }
    // Diving into a downslope turns the fall into forward speed.
    // Landing on a rising face throws that speed away.
    if (slope < 0.02) {
      const swoop = inbound * (hold ? 1 : 0.8)
      if (swoop > vt) vt = swoop
    } else if (hold) {
      vt *= 0.55
    }
  }

  const look = Math.max(2, Math.min(6.5, Math.abs(vt) * 0.12))
  const ahead = terrain.slope(b.x + look)
  const ramp = slope > 0.1 || (ahead > 0.16 && slope > -0.02)
  const crest = ahead < slope - 0.12 && slope > -0.15 && ahead < 0.02
  const launchNow = !hold && (b.launchCd || 0) <= 0 && vt > 13 && (ramp || crest) && !(wasAir && slope < -0.08)
  if (launchNow) {
    const pop = ramp ? 6 : 3.5
    b.grounded = false
    b.airT = 0
    b.launchCd = 0.2
    b.y = gy + 0.22
    b.vx = vt * c - s * pop * 0.12
    b.vy = vt * s + c * pop
    ev.launch = { x: b.x, y: b.y, slope, vt }
    capSpeed(b)
    return
  }

  b.y = gy
  b.grounded = true
  b.airT = 0
  vt += (hold ? HOLD_G : GLIDE_G * 0.35) * s * dt
  if (hold && slope < -0.02) vt += 20 * dt
  if (hold && slope > 0.12) vt -= 16 * dt
  vt -= vt * (hold ? 0.012 : 0.055) * dt
  if (hold && vt < 18 && vt > -8) vt += 22 * dt
  b.vx = vt * c
  b.vy = vt * s
  capSpeed(b)
}
