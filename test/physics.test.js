import assert from 'node:assert/strict'
import test from 'node:test'
import { Run, frameDistance } from '../src/game.js'
import { approachAngle, flightAngle, stepBird, BIRD_R, GRAVITY, HOLD_MUL, LAND_WINDOW } from '../src/physics.js'
import { hashString } from '../src/rng.js'
import { HILL_SPAN, OPENING_END, OPENING_KNOTS, Terrain } from '../src/terrain.js'
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
  assert.equal(GAME_VERSION, '1.4.0')
})

test('holding on a downhill builds speed and holding on an uphill spends it', () => {
  function roll(slope, seconds) {
    const terrain = {
      height(x) { return slope * x },
      slope() { return slope },
      curvature() { return 0 }
    }
    const th = Math.atan(slope)
    const speed0 = 22
    const b = {
      x: 0,
      y: BIRD_R,
      vx: Math.cos(th) * speed0,
      vy: Math.sin(th) * speed0,
      grounded: true,
      airT: 0
    }
    for (let i = 0; i < seconds * 120; i++) stepBird(b, true, terrain, 1 / 120, {})
    return Math.hypot(b.vx, b.vy)
  }
  const down = roll(-0.35, 0.6)
  const up = roll(0.35, 0.6)
  assert.ok(down > 28, `downhill should build speed, got ${down.toFixed(1)}`)
  assert.ok(up < 8, `uphill hold should fall through the old 8 m/s floor, got ${up.toFixed(1)}`)
})

test('holding in the air only strengthens gravity and does not steer the velocity', () => {
  const terrain = { height: () => -80, slope: () => 0 }
  const b = { x: 0, y: 40, vx: 26, vy: 0, grounded: false, airT: 0, launchCd: 0 }
  const steps = 60
  for (let i = 0; i < steps; i++) stepBird(b, true, terrain, 1 / 120, {})
  const expectedVy = GRAVITY * HOLD_MUL * (steps / 120)
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

function holdRelease(run) {
  return run.bird.grounded && run.terrain.slope(run.bird.x) < 0.02
}

test('hold then release on the first ramp leaves the ground', () => {
  const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
  let sawRelease = false
  let t = 0
  while (t < 12 && !run.over && run.launches === 0) {
    const hold = holdRelease(run)
    if (run.bird.grounded && !hold) sawRelease = true
    run.update(1 / 60, hold)
    t += 1 / 60
  }
  const alt = run.bird.y - run.terrain.height(run.bird.x)
  assert.ok(sawRelease, 'never released on the ramp')
  assert.ok(run.launches > 0, 'no launch off the first ramp')
  assert.ok(run.bird.vy > 8 || alt > 6, `launch did not clear, vy ${run.bird.vy.toFixed(2)} alt ${alt.toFixed(2)}`)
})

test('holding downhills and releasing on rises clears the opening face', () => {
  const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
  let best = null
  let cur = null
  let t = 0
  while (t < 16 && !run.over) {
    const launches = run.launches
    run.update(1 / 60, holdRelease(run))
    t += 1 / 60
    if (run.launches > launches) {
      cur = { vy: run.bird.vy, air: 0, clearance: 0 }
    }
    if (cur && !run.bird.grounded) {
      cur.air += 1 / 60
      const gap = run.bird.y - run.terrain.height(run.bird.x) - BIRD_R
      if (gap > cur.clearance) cur.clearance = gap
    } else if (cur && run.bird.grounded) {
      if (!best || cur.clearance > best.clearance) best = cur
      cur = null
    }
  }
  if (cur && (!best || cur.clearance > best.clearance)) best = cur
  assert.ok(best, 'never left the ground')
  assert.ok(best.clearance >= 25 && best.clearance <= 42, `opening clearance ${best.clearance.toFixed(1)}m`)
  assert.ok(best.air > 2, `opening airtime ${best.air.toFixed(2)}s`)
})

test('later hills still steepen', () => {
  const keys = ['2026-10-05', '2026-10-04', 'alpha', 'zzzz', 'puff']
  let later = 0
  for (const key of keys) {
    const terrain = new Terrain(hashString(key))
    for (let x = 1400; x <= 2200; x += 2) later = Math.max(later, Math.abs(terrain.slope(x)))
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

test('opening slopes stay continuous and flat at the peaks and valleys', () => {
  const terrain = new Terrain(hashString('2026-10-05'))
  const keys = OPENING_KNOTS.map(k => k.x)
  for (let i = 0; i <= 16; i++) keys.push(OPENING_END + i * HILL_SPAN)
  for (const x of keys) {
    assert.ok(Math.abs(terrain.slope(x)) < 1e-6, `slope at key ${x} is ${terrain.slope(x)}`)
    if (x < 1) continue
    const left = terrain.slope(x - 0.25)
    const right = terrain.slope(x + 0.25)
    assert.ok(Math.abs(left) < 0.05 && Math.abs(right) < 0.05, `slope jumps at ${x}: ${left}, ${right}`)
  }
  for (let x = 3; x < OPENING_END + 200; x += 7) {
    const fd = (terrain.height(x + 0.05) - terrain.height(x - 0.05)) / 0.1
    assert.ok(Math.abs(fd - terrain.slope(x)) < 0.015, `slope mismatch at ${x}: ${fd} vs ${terrain.slope(x)}`)
    const jump = Math.abs(terrain.slope(x + 0.5) - terrain.slope(x))
    assert.ok(jump < 0.08, `slope jump ${jump.toFixed(3)} at ${x}`)
  }
})

test('the opening touch is not a perfect for coasting or holding', () => {
  for (const hold of [false, true]) {
    const run = new Run({ seed: hashString('2026-10-05'), mode: 'daily' })
    while (run.time < 8 && !run.over) run.update(1 / 120, hold)
    assert.equal(run.perfects, 0, `${hold ? 'hold' : 'coast'} earned ${run.perfects} perfects`)
  }
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

test('a concave valley does not launch', () => {
  const terrain = {
    height(x) { return 0.08 * x * x },
    slope(x) { return 0.16 * x },
    curvature() { return 0.2 }
  }
  const b = {
    x: -6,
    y: terrain.height(-6) + BIRD_R,
    vx: 36,
    vy: 36 * terrain.slope(-6),
    grounded: true,
    airT: 0
  }
  let launches = 0
  for (let i = 0; i < 80; i++) {
    const ev = {}
    stepBird(b, false, terrain, 1 / 120, ev)
    if (ev.launch) launches++
  }
  assert.equal(launches, 0)
  assert.ok(b.x > 2, `did not cross the valley, x ${b.x.toFixed(1)}`)
  assert.equal(b.grounded, true)
})

test('timing outruns coasting and holding over a minute', () => {
  const keys = ['2026-10-05', '2026-10-04', 'alpha', 'zzzz', 'puff']
  const timing = (run) => run.bird.grounded && run.terrain.slope(run.bird.x) < 0
  for (const key of keys) {
    const seed = hashString(key)
    const none = fly(seed, () => false, 60)
    const hold = fly(seed, () => true, 60)
    const good = fly(seed, timing, 60)
    const noneBest = none.maxAlt
    assert.ok(none.run.bird.x < good.run.bird.x * 0.7, `${key} coast ${none.run.bird.x.toFixed(0)} vs time ${good.run.bird.x.toFixed(0)}`)
    assert.ok(hold.run.bird.x < good.run.bird.x * 0.7, `${key} hold ${hold.run.bird.x.toFixed(0)} vs time ${good.run.bird.x.toFixed(0)}`)
    assert.equal(none.run.perfects, 0, `${key} coast perfects ${none.run.perfects}`)
    assert.ok(good.maxAlt >= 25 && good.maxAlt <= 42, `${key} timing clearance ${good.maxAlt.toFixed(1)}`)
    assert.ok(noneBest < 16, `${key} coast hop ${noneBest.toFixed(1)}`)
  }
})

test('release on an upslope launches, and diving the downslope outruns never holding', () => {
  const seed = hashString('2026-10-05')
  const none = fly(seed, () => false, 20)
  const good = fly(seed, holdRelease, 20)
  assert.ok(good.maxAlt > 15, 'expected a real arc, max alt ' + good.maxAlt.toFixed(1))
  assert.ok(good.run.launches > 0, 'launch counter')
  assert.ok(good.run.bird.x > none.run.bird.x + 80, `timed x ${good.run.bird.x.toFixed(0)} vs glide ${none.run.bird.x.toFixed(0)}`)
})

test('the same seed and inputs stay deterministic', () => {
  const seed = hashString('2026-10-04')
  const a = fly(seed, (run, t) => Math.sin(t * 3) > 0, 8)
  const b = fly(seed, (run, t) => Math.sin(t * 3) > 0, 8)
  assert.equal(a.run.bird.x, b.run.bird.x)
  assert.equal(a.run.score, b.run.score)
  assert.equal(a.run.rec.length, b.run.rec.length)
})
