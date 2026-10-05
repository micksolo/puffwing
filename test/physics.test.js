import assert from 'node:assert/strict'
import test from 'node:test'
import { Run, frameDistance } from '../src/game.js'
import { approachAngle, flightAngle, stepBird, BIRD_R, GLIDE_G, HOLD_G_MUL, LAND_WINDOW } from '../src/physics.js'
import { hashString } from '../src/rng.js'
import { HILL_SPAN, Terrain } from '../src/terrain.js'
import { GAME_VERSION } from '../src/version.js'

function fly(seed, policy, seconds) {
  const run = new Run({ seed, mode: 'daily' })
  const samples = []
  let t = 0
  let maxAlt = 0
  let maxVy = -Infinity
  let minVy = Infinity
  while (t < seconds && !run.over) {
    const alt = run.bird.y - run.terrain.height(run.bird.x)
    if (t > 0.4 && alt > maxAlt) maxAlt = alt
    if (run.bird.vy > maxVy) maxVy = run.bird.vy
    if (run.bird.vy < minVy) minVy = run.bird.vy
    run.update(1 / 60, policy(run, t))
    if (samples.length < 400 && Math.round(t * 60) % 3 === 0) {
      samples.push({ t, x: run.bird.x, y: run.bird.y, vy: run.bird.vy, g: run.bird.grounded })
    }
    t += 1 / 60
  }
  return { run, samples, maxAlt, maxVy, minVy }
}

test('GAME_VERSION is semver and shown to the build', () => {
  assert.match(GAME_VERSION, /^\d+\.\d+\.\d+$/)
  assert.equal(GAME_VERSION, '1.3.1')
})

test('holding dives the bird below a glide in the first half second', () => {
  const seed = hashString('2026-10-05')
  const glide = fly(seed, () => false, 0.45)
  const dive = fly(seed, () => true, 0.45)
  const yGlide = glide.run.bird.y
  const yDive = dive.run.bird.y
  assert.ok(yDive < yGlide - 2, `dive y ${yDive.toFixed(2)} vs glide y ${yGlide.toFixed(2)}`)
  assert.ok(dive.minVy < glide.minVy - 12, `dive min vy ${dive.minVy.toFixed(1)} vs glide ${glide.minVy.toFixed(1)}`)
  assert.ok(dive.run.bird.vx >= 25, `dive kept forward speed, vx ${dive.run.bird.vx.toFixed(2)}`)
})

test('holding on a downslope never cuts horizontal speed and builds it', () => {
  const terrain = {
    height(x) { return -0.12 * x },
    slope() { return -0.12 }
  }
  const b = {
    x: 0,
    y: terrain.height(0) + BIRD_R,
    vx: 16,
    vy: 16 * -0.12,
    grounded: true,
    airT: 0,
    launchCd: 0
  }
  const vx0 = b.vx
  let minVx = b.vx
  for (let i = 0; i < 96; i++) {
    stepBird(b, true, terrain, 1 / 120, {})
    if (b.vx < minVx) minVx = b.vx
  }
  assert.ok(minVx >= vx0 - 1e-6, `min vx ${minVx} fell below ${vx0}`)
  assert.ok(b.vx > vx0 + 12, `expected a real acceleration, vx ${b.vx.toFixed(2)}`)
})

test('holding in the air only strengthens gravity and does not steer the velocity', () => {
  const terrain = { height: () => -80, slope: () => 0 }
  const b = { x: 0, y: 40, vx: 26, vy: 0, grounded: false, airT: 0, launchCd: 0 }
  const steps = 60
  for (let i = 0; i < steps; i++) stepBird(b, true, terrain, 1 / 120, {})
  const expectedVy = GLIDE_G * HOLD_G_MUL * (steps / 120)
  assert.ok(Math.abs(b.vy - expectedVy) < 0.05, `vy ${b.vy.toFixed(2)} expected ${expectedVy.toFixed(2)}`)
  assert.ok(Math.abs(b.vx - 26) < 1e-6, `vx was steered to ${b.vx}`)
  const ang = Math.atan2(b.vy, b.vx)
  assert.ok(Math.abs(flightAngle(b.vx, b.vy, false, -0.4) - ang) < 1e-9)
})

test('the camera pulls back, and further when the bird is high or fast', () => {
  const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
  run.update(1 / 30, false)
  assert.ok(run.camZ > 95, `resting camera z ${run.camZ.toFixed(1)}`)
  run.bird.vx = 42
  run.bird.vy = 12
  run.bird.y = run.terrain.height(run.bird.x) + 26
  run.bird.grounded = false
  for (let i = 0; i < 80; i++) run.updateCamera(1 / 30)
  assert.ok(run.camZ > 155, `zoomed camera z ${run.camZ.toFixed(1)}`)
  const desktop = frameDistance(run.camZ, 16 / 9)
  const phonePortrait = frameDistance(run.camZ, 390 / 844)
  const phoneLandscape = frameDistance(run.camZ, 844 / 390)
  assert.equal(desktop, run.camZ)
  assert.equal(phoneLandscape, desktop, 'a landscape phone uses the landscape camera')
  assert.ok(phonePortrait > desktop * 1.35, `portrait distance ${phonePortrait.toFixed(1)}`)
  assert.ok(phonePortrait <= 252, `portrait distance capped, got ${phonePortrait.toFixed(1)}`)
})

test('hold then release on the first hill launches', () => {
  const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
  const vx0 = run.bird.vx
  let minHoldVx = Infinity
  let sawHold = false
  let t = 0
  while (t < 10 && !run.over && run.launches === 0) {
    const b = run.bird
    const sl = run.terrain.slope(b.x)
    const ahead = run.terrain.slope(b.x + 5)
    const hold = sl < 0.02 && ahead < 0.08
    if (hold) {
      sawHold = true
      if (b.vx < minHoldVx) minHoldVx = b.vx
    }
    run.update(1 / 60, hold)
    t += 1 / 60
  }
  const alt = run.bird.y - run.terrain.height(run.bird.x)
  assert.ok(sawHold, 'never held on the opening downhill')
  assert.ok(minHoldVx >= vx0 - 0.05, `hold cut speed to ${minHoldVx.toFixed(2)} from ${vx0}`)
  assert.ok(run.launches > 0, 'no launch off the first hill')
  assert.ok(run.bird.vy > 4 || alt > 3, `launch did not clear, vy ${run.bird.vy.toFixed(2)} alt ${alt.toFixed(2)}`)
})

test('the first 160 metres stay gentle and later hills steepen', () => {
  const keys = ['2026-10-05', '2026-10-04', 'alpha', 'zzzz', 'puff']
  let later = 0
  for (const key of keys) {
    const terrain = new Terrain(hashString(key))
    let max = 0
    for (let x = 0; x <= 160; x += 1) max = Math.max(max, Math.abs(terrain.slope(x)))
    assert.ok(max < 0.2, `${key} opening slope ${max.toFixed(3)}`)
    for (let x = 900; x <= 1600; x += 2) later = Math.max(later, Math.abs(terrain.slope(x)))
  }
  assert.ok(later > 0.35, `later hills stayed flat, max slope ${later.toFixed(3)}`)
})

test('rotation matches the velocity in the air and the slope on the ground', () => {
  const air = flightAngle(20, -10, false, 0.4)
  assert.ok(Math.abs(air - Math.atan2(-10, 20)) < 1e-9, `air angle ${air}`)
  const slope = -0.35
  const ground = flightAngle(30, 4, true, slope)
  assert.ok(Math.abs(ground - Math.atan(slope)) < 1e-9, `ground angle ${ground}`)
  const step = approachAngle(0, air, 1 / 120)
  assert.ok(step < -0.01 && step > air + 0.2, `angle snapped to ${step} toward ${air}`)
})

test('a smooth landing keeps most of the speed and a bad one loses it', () => {
  const slope = -0.22
  const th = Math.atan(slope)
  const speed = 40
  const ang = th - 18 * Math.PI / 180
  assert.ok(Math.abs(ang - th) < LAND_WINDOW)
  const terrain = { height: () => 0, slope: () => slope }
  const b = {
    x: 0,
    y: BIRD_R + 0.04,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    grounded: false,
    airT: 0.6,
    launchCd: 0,
    diving: true
  }
  const incoming = Math.hypot(b.vx, b.vy)
  const ev = {}
  stepBird(b, true, terrain, 1 / 120, ev)
  assert.equal(b.grounded, true)
  assert.equal(ev.landing.smooth, true)
  const kept = Math.hypot(b.vx, b.vy)
  assert.ok(kept > incoming * 0.9, `smooth landing kept ${kept.toFixed(2)} of ${incoming.toFixed(2)}`)
  assert.ok(b.vx >= incoming * Math.cos(ang) - 0.05, `forward speed fell to ${b.vx.toFixed(2)}`)

  const rise = 0.45
  const bad = {
    x: 0,
    y: BIRD_R + 0.02,
    vx: 34,
    vy: -6,
    grounded: false,
    airT: 0.5,
    launchCd: 0
  }
  const badIn = Math.hypot(bad.vx, bad.vy)
  const badEv = {}
  stepBird(bad, false, { height: () => 0, slope: () => rise }, 1 / 120, badEv)
  const badOut = Math.hypot(bad.vx, bad.vy)
  assert.equal(badEv.landing.smooth, false)
  assert.ok(badOut < badIn * 0.85, `bad landing kept ${badOut.toFixed(2)} of ${badIn.toFixed(2)}`)
})

test('perfect landings keep the bonus', () => {
  const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
  run.time = 3
  run.bird.vx = 36
  run.bird.vy = 36 * -0.2
  const before = Math.hypot(run.bird.vx, run.bird.vy)
  run.handleLanding({
    slope: -0.2,
    vx: 36,
    vy: 36 * -0.2,
    airT: 0.7,
    smooth: true,
    diff: 0
  })
  assert.equal(run.perfects, 1)
  assert.ok(Math.hypot(run.bird.vx, run.bird.vy) > before, 'perfect did not add speed')
})

test('hill slopes stay continuous and flat at the peaks and valleys', () => {
  const terrain = new Terrain(hashString('2026-10-05'))
  for (let i = 0; i <= 24; i++) {
    const x = i * HILL_SPAN
    assert.ok(Math.abs(terrain.slope(x)) < 1e-8, `slope at key ${x} is ${terrain.slope(x)}`)
    const left = terrain.slope(x - 0.25)
    const right = terrain.slope(x + 0.25)
    assert.ok(Math.abs(left) < 0.02 && Math.abs(right) < 0.02, `slope jumps at ${x}: ${left}, ${right}`)
  }
  for (let x = 3; x < 700; x += 11) {
    const fd = (terrain.height(x + 0.05) - terrain.height(x - 0.05)) / 0.1
    assert.ok(Math.abs(fd - terrain.slope(x)) < 0.015, `slope mismatch at ${x}: ${fd} vs ${terrain.slope(x)}`)
    const jump = Math.abs(terrain.slope(x + 0.5) - terrain.slope(x))
    assert.ok(jump < 0.08, `slope jump ${jump.toFixed(3)} at ${x}`)
  }
})

test('a held dive lines up with the first downslope', () => {
  const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
  const vx0 = run.bird.vx
  while (run.time < 2 && !run.lastLanding && !run.over) run.update(1 / 120, true)
  const l = run.lastLanding
  assert.ok(l, 'never landed')
  assert.ok(l.slope < -0.02, `landed on slope ${l.slope}`)
  assert.ok(Math.abs(l.diff) <= LAND_WINDOW + 1e-6, `meet angle ${(l.diff * 180 / Math.PI).toFixed(1)}°`)
  assert.equal(l.smooth, true)
  assert.ok(run.bird.vx >= vx0 - 0.05, `landing cut vx to ${run.bird.vx.toFixed(2)}`)
})

test('the render pose blends the previous and current physics step', () => {
  const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
  run.update(1 / 144, true)
  assert.ok(run.alpha > 0.7 && run.alpha < 1, `alpha ${run.alpha}`)
  assert.equal(run.pose().x, run.bird.x)
  run.update(1 / 60, true)
  const pose = run.pose()
  const lo = Math.min(run.prev.x, run.bird.x)
  const hi = Math.max(run.prev.x, run.bird.x)
  assert.ok(pose.x >= lo - 1e-6 && pose.x <= hi + 1e-6, `pose x ${pose.x} outside ${lo}..${hi}`)
  assert.ok(pose.alpha >= 0 && pose.alpha < 1)
})

test('release on an upslope launches, and diving the downslope outruns never holding', () => {
  const seed = hashString('2026-10-05')
  const none = fly(seed, () => false, 20)
  function timed(run) {
    const b = run.bird
    const sl = run.terrain.slope(b.x)
    const ahead = run.terrain.slope(b.x + 3.2 + Math.min(Math.max(b.vx, 0), 40) * 0.1)
    if (!b.grounded) {
      if (b.vy > -1.5) return false
      return sl < 0.08 || ahead < 0.02
    }
    if (sl > 0.04 || ahead > 0.1) return false
    return true
  }
  const good = fly(seed, timed, 20)
  assert.ok(good.maxVy > 8, 'expected an upward launch, max vy ' + good.maxVy.toFixed(1))
  assert.ok(good.maxAlt > 4, 'expected a real hop, max alt ' + good.maxAlt.toFixed(1))
  assert.ok(good.run.launches > 0, 'launch counter')
  assert.ok(good.run.bird.x > none.run.bird.x + 200, `timed x ${good.run.bird.x.toFixed(0)} vs glide ${none.run.bird.x.toFixed(0)}`)
})

test('the same seed and inputs stay deterministic', () => {
  const seed = hashString('2026-10-04')
  const a = fly(seed, (run, t) => Math.sin(t * 3) > 0, 8)
  const b = fly(seed, (run, t) => Math.sin(t * 3) > 0, 8)
  assert.equal(a.run.bird.x, b.run.bird.x)
  assert.equal(a.run.score, b.run.score)
  assert.equal(a.run.rec.length, b.run.rec.length)
})
