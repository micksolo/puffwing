export const GLIDE_G = -18
export const BIRD_R = 0.9
export const MAX_SPEED = 64
// A held dive aims at about 55° and is not allowed to go near vertical.
const DIVE_TAN = Math.tan(55 * Math.PI / 180)
const DIVE_TAN_MAX = Math.tan(62 * Math.PI / 180)
const DIVE_PULL = 220

function capSpeed(b, hold) {
  const sp = Math.hypot(b.vx, b.vy)
  if (sp <= MAX_SPEED) return
  if (hold) {
    const room = Math.sqrt(Math.max(0, MAX_SPEED * MAX_SPEED - Math.min(b.vx, MAX_SPEED) ** 2))
    if (b.vx > MAX_SPEED) b.vx = MAX_SPEED
    if (Math.abs(b.vy) > room) b.vy = Math.sign(b.vy || -1) * room
    return
  }
  b.vx *= MAX_SPEED / sp
  b.vy *= MAX_SPEED / sp
}

// Nose angle in radians. Holding tucks the beak down on the first frame,
// before gravity has moved the bird, so the press is obvious in the air and
// on the ground. In the air the tuck is a diagonal dive, not a vertical plunge.
export function diveTilt(vx, vy, hold, grounded) {
  const along = Math.atan2(vy, Math.max(vx, 8))
  if (hold && !grounded) {
    const aim = Math.min(along, -0.96)
    return Math.max(-1.15, aim)
  }
  const tuck = hold && grounded ? 0.72 : 0
  const tilt = along * (hold ? 1 : 0.92) - tuck
  return Math.max(-1.15, Math.min(0.7, tilt))
}

function slide(vx, slope, hold, dt) {
  if (slope < -0.008) {
    // Steeper downhills build more speed. Holding builds it much faster.
    const accel = (hold ? 148 : 16) * -slope
    return vx + accel * dt
  }
  if (slope > 0.03) {
    const brake = (hold ? 10 : 32) * slope
    let next = vx - brake * dt
    if (hold) next = Math.max(next, vx - 8 * dt)
    return Math.max(4, next)
  }
  const drag = hold ? 0.002 : 0.04
  const next = vx - vx * drag * dt
  return hold ? Math.max(next, vx) : next
}

export function stepBird(b, hold, terrain, dt, ev) {
  if (b.launchCd > 0) b.launchCd -= dt
  // A dive stays charged until the player releases on a ramp. Never holding
  // never charges, so touching an upslope is not itself a launch.
  if (hold) b.diving = true

  if (b.grounded) {
    const oldVx = b.vx
    const slope = terrain.slope(b.x)
    let vx = slide(Math.max(0, oldVx), slope, hold, dt)
    if (hold && slope < -0.008 && vx < oldVx) vx = oldVx
    b.x += vx * dt
    const gy = terrain.height(b.x) + BIRD_R
    const look = Math.max(2.5, Math.min(7, vx * 0.14))
    const ahead = terrain.slope(b.x + look)
    const ramp = slope > 0.012 || (ahead > 0.045 && slope > -0.02)
    const crest = ahead < slope - 0.06 && slope > -0.2 && ahead < 0.04
    if (!hold && b.diving && (b.launchCd || 0) <= 0 && vx > 11 && (ramp || crest)) {
      b.diving = false
      const pop = (ramp ? 8 : 4.5) + Math.min(vx, 40) * 0.18
      b.grounded = false
      b.airT = 0
      b.launchCd = 0.18
      b.y = gy + 0.28
      b.vx = vx
      b.vy = vx * Math.max(slope, 0.04) + pop
      ev.launch = { x: b.x, y: b.y, slope, vt: vx }
      capSpeed(b, false)
      return
    }
    // A crest can drop the bird off the surface. Holding keeps it planted
    // on the way down so the tuck cannot skip and then stop.
    const fellAway = gy < b.y + vx * slope * dt - 0.45
    if (fellAway && !hold) {
      b.diving = false
      b.grounded = false
      b.y = b.y + vx * slope * dt
      b.vx = vx
      b.vy = vx * slope
      b.airT = 0
      capSpeed(b, false)
      return
    }
    // Releasing on the downhill spends the dive. Releasing as the ground
    // turns up keeps it long enough for the launch on the next frames.
    if (!hold && slope < -0.01) b.diving = false
    b.y = gy
    b.vx = vx
    b.vy = vx * slope
    b.airT = 0
    capSpeed(b, hold)
    return
  }

  if (hold) {
    // Steer the fall toward a ~55° descent. Horizontal speed is left alone.
    const speedX = Math.max(b.vx, 10)
    const target = -speedX * DIVE_TAN
    const floor = -speedX * DIVE_TAN_MAX
    if (b.vy > target) b.vy -= DIVE_PULL * dt
    if (b.vy < floor) b.vy = floor
  } else {
    b.vy += GLIDE_G * dt
    b.vx -= b.vx * 0.003 * dt
  }

  b.x += b.vx * dt
  b.y += b.vy * dt

  const gy = terrain.height(b.x) + BIRD_R
  if (b.y > gy) {
    b.airT = (b.airT || 0) + dt
    capSpeed(b, hold)
    return
  }

  const slope = terrain.slope(b.x)
  const oldVx = b.vx
  const oldVy = b.vy
  const th = Math.atan(slope)
  const vn = -oldVx * Math.sin(th) + oldVy * Math.cos(th)
  if (vn < -0.5) {
    ev.landing = { slope, vt: oldVx, vn, vx: oldVx, vy: oldVy, airT: b.airT || 0 }
  }

  // One landing. Keep the forward speed, and fold a single chunk of the
  // fall into it. This used to run every skim and multiply until vx hit 0
  // or the cap, depending on the slope.
  let vx = Math.max(0, oldVx)
  if ((b.airT || 0) > 0.16 && oldVy < -3 && slope < 0.12) {
    const into = (hold || b.diving) && slope < 0.02 ? 0.55 : 0.1
    vx += Math.min(18, -oldVy * into)
  }
  if (hold && slope < -0.008 && vx < oldVx) vx = oldVx

  const look = Math.max(2.5, Math.min(7, vx * 0.14))
  const ahead = terrain.slope(b.x + look)
  const ramp = slope > 0.012 || (ahead > 0.045 && slope > -0.02)
  const crest = ahead < slope - 0.06 && slope > -0.2 && ahead < 0.04
  if (!hold && b.diving && (b.launchCd || 0) <= 0 && vx > 11 && (ramp || crest) && slope >= -0.08) {
    b.diving = false
    const pop = (ramp ? 8 : 4.5) + Math.min(vx, 40) * 0.18
    b.grounded = false
    b.airT = 0
    b.launchCd = 0.18
    b.y = gy + 0.28
    b.vx = vx
    b.vy = vx * Math.max(slope, 0.04) + pop
    ev.launch = { x: b.x, y: b.y, slope, vt: vx }
    capSpeed(b, false)
    return
  }

  b.y = gy
  b.grounded = true
  b.airT = 0
  if (!hold && slope < -0.01) b.diving = false
  b.vx = vx
  b.vy = vx * slope
  capSpeed(b, hold)
}
