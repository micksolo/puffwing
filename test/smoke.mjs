import { Run } from '../src/game.js'
import { todayKey, hashString } from '../src/rng.js'

function sim(seed) {
  const run = new Run({ seed, mode: 'test' })
  let frames = 0
  while (!run.over && frames < 60 * 240) {
    const b = run.bird
    const slopeHere = run.terrain.slope(b.x)
    const hold = slopeHere < 0 && (b.grounded || b.vy < 6)
    run.update(1 / 60, hold)
    frames++
  }
  return run
}

const seed = hashString('2026-10-04')
const run = sim(seed)

const checks = []
const ok = (name, cond, info = '') => {
  checks.push({ name, pass: !!cond, info })
  if (!cond) console.error('FAIL:', name, info)
}

ok('run terminates', run.over, 'frames simulated')
ok('finite state', [run.bird.x, run.bird.y, run.bird.vx, run.bird.vy].every(Number.isFinite))
ok('traveled far', run.bird.x > 300, 'x=' + run.bird.x.toFixed(1))
ok('night reached', run.dayLeft <= 0)
ok('replay recorded', run.rec.length >= 4 && run.rec.length <= 4200, 'samples=' + run.rec.length / 2)
ok('score positive', run.score > 0, 'score=' + run.score)

const run2 = sim(seed)
ok('deterministic', run2.score === run.score && run2.rec.length === run.rec.length)

let pass = 0
for (const c of checks) if (c.pass) pass++
console.log(`${pass}/${checks.length} checks passed`)
console.log('distance:', run.distance, 'm  coins:', run.coins, '  perfects:', run.perfects, '  score:', run.score)
if (pass < checks.length) process.exit(1)
