import assert from 'node:assert/strict'
import test from 'node:test'
import { Run } from '../src/game.js'
import { diveTilt, stepBird, BIRD_R } from '../src/physics.js'
import { hashString } from '../src/rng.js'
import { Terrain } from '../src/terrain.js'
import { GAME_VERSION } from '../src/version.js'

function fly(seed, policy, seconds) {
  const run = new Run({ seed, mode: 'daily' })
  const samples = []
  let t = 0
  let maxAlt = 0
  let maxVy = -Infinity
  while (t < seconds && !run.over) {
    const alt = run.bird.y - run.terrain.height(run.bird.x)
    if (t > 0.4 && alt > maxAlt) maxAlt = alt
    if (run.bird.vy > maxVy) maxVy = run.bird.vy
    run.update(1 / 60, policy(run, t))
    if (samples.length < 400 && Math.round(t * 60) % 3 === 0) {
      samples.push({ t, x: run.bird.x, y: run.bird.y, vy: run.bird.vy, g: run.bird.grounded })
    }
    t += 1 / 60
  }
  return { run, samples, maxAlt, maxVy }
}

test('GAME_VERSION is semver and shown to the build', () => {
  assert.match(GAME_VERSION, /^\d+\.\d+\.\d+$/)
  assert.equal(GAME_VERSION, '1.2.2')
})

test('holding dives the bird below a glide in the first half second', () => {
  const seed = hashString('2026-10-05')
  const glide = fly(seed, () => false, 0.45)
  const dive = fly(seed, () => true, 0.45)
  const yGlide = glide.run.bird.y
  const yDive = dive.run.bird.y
  assert.ok(yDive < yGlide - 2, `dive y ${yDive.toFixed(2)} vs glide y ${yGlide.toFixed(2)}`)
  assert.ok(dive.run.bird.vy < glide.run.bird.vy - 6, `dive vy ${dive.run.bird.vy} vs ${glide.run.bird.vy}`)
  assert.ok(dive.run.bird.vx >= 17.5, `dive kept forward speed, vx ${dive.run.bird.vx.toFixed(2)}`)
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
  assert.ok(b.vx > vx0 + 4, `expected a real acceleration, vx ${b.vx.toFixed(2)}`)
})

test('an air hold is a diagonal dive that keeps forward speed', () => {
  const terrain = { height: () => -80, slope: () => 0 }
  const b = { x: 0, y: 30, vx: 18, vy: 2, grounded: false, airT: 0, launchCd: 0 }
  for (let i = 0; i < 72; i++) stepBird(b, true, terrain, 1 / 120, {})
  const deg = Math.atan2(-b.vy, b.vx) * 180 / Math.PI
  assert.ok(b.vx >= 18 - 1e-6, `vx dropped to ${b.vx}`)
  assert.ok(deg >= 30 && deg <= 48, `descent ${deg.toFixed(1)}°`)
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

test('holding tucks the beak down even before speed changes', () => {
  const level = diveTilt(18, 0, false, true)
  const tucked = diveTilt(18, 0, true, true)
  const air = diveTilt(16, -2, false, false)
  const airTuck = diveTilt(16, -2, true, false)
  assert.ok(level - tucked > 0.5, `ground tuck ${tucked} vs ${level}`)
  assert.ok(air - airTuck > 0.6, `air tuck ${airTuck} vs ${air}`)
  assert.ok(tucked < -0.5)
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
