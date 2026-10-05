import assert from 'node:assert/strict'
import test from 'node:test'
import { Run } from '../src/game.js'
import { diveTilt } from '../src/physics.js'
import { hashString } from '../src/rng.js'
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
  assert.equal(GAME_VERSION, '1.2.0')
})

test('holding dives the bird far below a glide in the first half second', () => {
  const seed = hashString('2026-10-05')
  const glide = fly(seed, () => false, 0.45)
  const dive = fly(seed, () => true, 0.45)
  const yGlide = glide.run.bird.y
  const yDive = dive.run.bird.y
  assert.ok(yDive < yGlide - 4, `dive y ${yDive.toFixed(2)} vs glide y ${yGlide.toFixed(2)}`)
  assert.ok(dive.run.bird.vy < glide.run.bird.vy - 15, `dive vy ${dive.run.bird.vy} vs ${glide.run.bird.vy}`)
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
