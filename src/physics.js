export const GRAVITY = -28
export const HOLD_MUL = 3.2
export const BIRD_R = 0.9
export const MAX_SPEED = 85
// Rolling resistance. Flats and weak downhills bleed speed, so coasting
// finishes short of a timed run.
export const ROLL_DRAG = 0.18
// A landing this close to a downhill keeps nearly all of its speed.
export const LAND_WINDOW = 22 * Math.PI / 180
// Tighter than the keep-speed window. Perfects also need real airtime.
export const PERFECT_WINDOW = 15 * Math.PI / 180
// Old name kept so a held dive can still be checked against the slope.
export const GLIDE_G = GRAVITY

export function gravity(hold) {
  return GRAVITY * (hold ? HOLD_MUL : 1)
}

function wrapPi(d) {
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function capSpeed(b) {
  const sp = Math.hypot(b.vx, b.vy)
  if (sp <= MAX_SPEED) return
  const s = MAX_SPEED / sp
  b.vx *= s
  b.vy *= s
}

function curvatureOf(terrain, x) {
  if (typeof terrain.curvature === 'function') return terrain.curvature(x)
  const h = 0.2
  const ym = terrain.height(x - h)
  const y = terrain.height(x)
  const yp = terrain.height(x + h)
  const ypp = (ym - 2 * y + yp) / (h * h)
  const slope = terrain.slope ? terrain.slope(x) : (yp - ym) / (2 * h)
  return ypp / Math.pow(1 + slope * slope, 1.5)
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

function leaveGround(b, terrain, vx, vy, ev, slope, speed) {
  b.grounded = false
  b.airT = 0
  b.vx = vx
  b.vy = vy
  b.y = terrain.height(b.x) + BIRD_R + 0.03
  ev.launch = { x: b.x, y: b.y, slope, vt: speed }
  capSpeed(b)
}

export function stepBird(b, hold, terrain, dt, ev) {
  const g = gravity(hold)

  if (b.grounded) {
    const slope = terrain.slope(b.x)
    const th = Math.atan(slope)
    const c = Math.cos(th)
    const sn = Math.sin(th)
    // Tangential speed. Gravity along the slope is the only drive.
    // Uphill hold costs speed; nothing pins vx from falling.
    let speed = b.vx * c + b.vy * sn
    if (speed < 0) speed = 0
    speed += g * sn * dt
    speed -= speed * ROLL_DRAG * dt
    if (speed < 0) speed = 0
    const vx = speed * c
    const vy = speed * sn
    const nx = b.x + vx * dt
    const kappa = curvatureOf(terrain, b.x)
    // Convex crest: center of curvature is below the bird. Leave when the
    // turn asks for more normal acceleration than gravity supplies.
    const convex = kappa < -1e-5
    const crest = convex && speed * speed * (-kappa) > (-g) * c
    const by = b.y + vy * dt + 0.5 * g * dt * dt
    const ballistic = by > terrain.height(nx) + BIRD_R + 1e-4 && convex
    if (crest || ballistic) {
      b.x = nx
      leaveGround(b, terrain, vx, vy, ev, slope, speed)
      return
    }
    b.x = nx
    b.y = terrain.height(b.x) + BIRD_R
    b.vx = vx
    b.vy = vy
    b.airT = 0
    capSpeed(b)
    return
  }

  b.vy += g * dt
  b.x += b.vx * dt
  b.y += b.vy * dt

  const gy = terrain.height(b.x) + BIRD_R
  if (b.y > gy) {
    b.airT = (b.airT || 0) + dt
    capSpeed(b)
    return
  }

  const slope = terrain.slope(b.x)
  const th = Math.atan(slope)
  const c = Math.cos(th)
  const sn = Math.sin(th)
  const oldVx = b.vx
  const oldVy = b.vy
  const diff = wrapPi(Math.atan2(oldVy, Math.max(oldVx, 1e-6)) - th)
  const incoming = Math.hypot(oldVx, oldVy)
  const along = oldVx * c + oldVy * sn
  const down = slope < -0.02
  const smooth = down && Math.abs(diff) <= LAND_WINDOW
  // Project onto the tangent. A lined-up downhill keeps the speed. A rise
  // or a wide angle keeps only part of the forward component.
  let speed
  if (smooth) speed = incoming * 0.97
  else if (slope > 0.02 || Math.abs(diff) > LAND_WINDOW) speed = Math.max(0, along) * 0.55
  else speed = Math.max(0, along) * 0.8
  const vn = -oldVx * sn + oldVy * c
  if (vn < -0.4 || incoming > 8) {
    ev.landing = {
      slope, vt: oldVx, vn, vx: oldVx, vy: oldVy,
      airT: b.airT || 0, diff, smooth, incoming
    }
  }
  b.y = gy
  b.grounded = true
  b.airT = 0
  b.vx = speed * c
  b.vy = speed * sn
  capSpeed(b)
}
