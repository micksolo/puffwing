export const GLIDE_G = -13
export const BIRD_R = 0.9
export const MAX_SPEED = 85
// Air hold is only a stronger gravity. It never aims the velocity.
export const HOLD_G_MUL = 4
// On the ground the same idea is the tangential part of gravity. The held
// value keeps the 1.2.4 downhill pace (about 240 times the grade).
const GROUND_G = -22
const GROUND_HOLD_G = -240
// A landing this close to the downhill tangent keeps its speed and is
// snapped onto the slope. Wider than this, or into a rise, is a bump.
export const LAND_WINDOW = 30 * Math.PI / 180
// Unheld flight is lighter than the base gravity so a launch hangs.
// Holding stays at HOLD_G_MUL times the base and never steers the velocity.
const FLOAT_G = GLIDE_G * 0.5
// 1.2.4 launch: a charged release adds this on top of the uphill momentum.
// At about 69 forward it is roughly 38 upward.

function wrapPi(d) {
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function capLaunch(b) {
  const room = Math.sqrt(Math.max(0, MAX_SPEED * MAX_SPEED - Math.min(b.vx, MAX_SPEED) ** 2))
  if (b.vx > MAX_SPEED) b.vx = MAX_SPEED
  if (Math.abs(b.vy) > room) b.vy = Math.sign(b.vy || 1) * room
}

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

// Target nose angle. In the air it is the velocity direction. On the ground
// it is the slope tangent. Holding does not change it.
export function flightAngle(vx, vy, grounded, slope) {
  if (grounded) return Math.atan(slope || 0)
  return Math.atan2(vy, Math.max(vx, 1e-6))
}

// Ease toward a target angle. One step never jumps the whole way.
export function approachAngle(current, target, dt) {
  const d = wrapPi(target - current)
  const k = 1 - Math.exp(-18 * Math.max(0, Math.min(dt || 0, 0.05)))
  return current + d * k
}

function tangentSpeed(vx, slope) {
  return Math.max(0, vx) * Math.hypot(1, slope)
}

function slideSpeed(oldVx, slope, hold, dt) {
  const th = Math.atan(slope)
  let s = tangentSpeed(oldVx, slope)
  const g = hold ? GROUND_HOLD_G : GROUND_G
  s += g * Math.sin(th) * dt
  if (Math.abs(slope) <= 0.03) {
    const drag = hold ? 0.001 : 0.015
    s -= s * drag * dt
  }
  if (hold && slope < -0.008) s = Math.max(s, tangentSpeed(oldVx, slope))
  if (slope > 0.03) s = Math.max(s, 8 * Math.hypot(1, slope))
  let vx = s * Math.cos(th)
  if (hold && slope < -0.008 && vx < oldVx) vx = oldVx
  return vx
}

export function stepBird(b, hold, terrain, dt, ev) {
  if (b.launchCd > 0) b.launchCd -= dt
  if (hold) b.diving = true

  if (b.grounded) {
    const oldVx = b.vx
    const slope = terrain.slope(b.x)
    const vx = slideSpeed(Math.max(0, oldVx), slope, hold, dt)
    const look = Math.max(3, Math.min(8, vx * 0.12))
    const ahead = terrain.slope(b.x + look)
    const rising = slope > 0.015
    // The crest is where the rise flattens and the ground bends away.
    const crest = slope > -0.04 && ahead < slope - 0.035 && ahead < 0.04
    const nx = b.x + vx * dt
    const gy = terrain.height(nx) + BIRD_R
    // One glide step along the tangent. When that point is above the hill,
    // the crest has curved away and the bird is no longer on the ground.
    const ny = b.y + vx * slope * dt + 0.5 * FLOAT_G * dt * dt
    const carriedOff = ny > gy + 0.002 && slope > -0.05
    if (!hold && (b.launchCd || 0) <= 0 && vx > 11 && (rising || crest || carriedOff)) {
      const ramp = rising || ahead > 0.02
      // A held dive cashes out as the old launch pop. A plain release still
      // leaves on its uphill momentum instead of being pinned to the mesh.
      const pop = b.diving ? (ramp ? 14 : 7) + Math.min(vx, 72) * 0.32 : 2
      b.diving = false
      b.grounded = false
      b.airT = 0
      b.launchCd = 0.18
      b.x = nx
      b.y = gy + 0.35
      b.vx = vx
      b.vy = vx * Math.max(slope, ramp ? 0.05 : 0) + pop
      ev.launch = { x: b.x, y: b.y, slope, vt: vx }
      capLaunch(b)
      return
    }
    if (!hold && slope < -0.01) b.diving = false
    // Holding sticks to the ground. A released bird on a downslope rides it
    // too, but an uphill release has already left above.
    b.x = nx
    b.y = gy
    b.vx = vx
    b.vy = vx * slope
    b.airT = 0
    capSpeed(b, hold)
    return
  }

  b.vy += (hold ? GLIDE_G * HOLD_G_MUL : FLOAT_G) * dt
  if (!hold) b.vx -= b.vx * 0.003 * dt

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
  const c = Math.cos(th)
  const sn = Math.sin(th)
  const diff = wrapPi(Math.atan2(oldVy, Math.max(oldVx, 1e-6)) - th)
  const incoming = Math.hypot(oldVx, oldVy)
  const rise = slope > 0.05
  const smooth = !rise && slope < -0.02 && Math.abs(diff) <= LAND_WINDOW
  const vn = -oldVx * sn + oldVy * c
  let s
  if (smooth) {
    s = incoming * 0.98
  } else if (rise || Math.abs(diff) > LAND_WINDOW) {
    const along = oldVx * c + oldVy * sn
    s = Math.max(0, along) * (rise ? 0.62 : 0.72)
  } else {
    s = incoming * 0.96
  }
  let vx = s * c
  if (hold && slope < -0.008 && vx < oldVx) vx = oldVx
  if (vn < -0.5) {
    ev.landing = {
      slope, vt: oldVx, vn, vx: oldVx, vy: oldVy,
      airT: b.airT || 0, diff, smooth, incoming
    }
  }

  if (!smooth && (rise || Math.abs(diff) > LAND_WINDOW)) b.diving = false

  b.y = gy
  b.grounded = true
  b.airT = 0
  if (!hold && slope < -0.01) b.diving = false
  b.vx = vx
  b.vy = vx * slope
  capSpeed(b, hold)
}
