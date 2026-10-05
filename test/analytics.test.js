import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { applyEvent, emptyAgg, foldLive, summarize } from '../netlify/functions/_shared/analytics-agg.js'
import { GAME_VERSION } from '../src/version.js'

function ev(name, props = {}, extra = {}) {
  return {
    clientId: extra.clientId || 'client-a',
    sessionId: extra.sessionId || 'session-a',
    name,
    t: extra.t || 1_700_000_000_000,
    version: extra.version || GAME_VERSION,
    props
  }
}

function memoryStore() {
  const data = new Map()
  const etags = new Map()
  let n = 1
  const clone = (v) => JSON.parse(JSON.stringify(v))
  return {
    async get(key, opts) {
      if (!data.has(key)) return null
      const v = data.get(key)
      if (opts && opts.type === 'json') return typeof v === 'string' ? JSON.parse(v) : clone(v)
      return typeof v === 'string' ? v : JSON.stringify(v)
    },
    async getWithMetadata(key, opts) {
      if (!data.has(key)) return null
      return { data: await this.get(key, opts), etag: etags.get(key), metadata: {} }
    },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false }
      if (opts.onlyIfMatch && etags.get(key) !== opts.onlyIfMatch) return { modified: false }
      data.set(key, clone(value))
      const etag = String(++n)
      etags.set(key, etag)
      return { modified: true, etag }
    }
  }
}

test('GAME_VERSION is the version the client sends', () => {
  assert.match(GAME_VERSION, /^\d+\.\d+\.\d+$/)
  const client = fs.readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8')
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const fn = fs.readFileSync(new URL('../netlify/functions/analytics.js', import.meta.url), 'utf8')
  assert.match(client, /GAME_VERSION/)
  assert.match(client, /pw_cid/)
  assert.match(client, /\/api\/analytics/)
  assert.match(client, /sendBeacon/)
  assert.match(client, /15000/)
  assert.match(client, /clientId/)
  assert.match(client, /sessionId/)
  assert.match(client, /gameVersion/)
  assert.match(main, /run_start/)
  assert.match(main, /run_end/)
  assert.match(main, /airtime/)
  assert.match(main, /milestone\('dive'\)/)
  assert.match(fn, /puffwing-analytics/)
  assert.match(fn, /\/api\/analytics/)
  assert.match(fn, /ANALYTICS_TOKEN/)
  assert.equal(fn.includes('sonar-snake'), false)
  assert.match(fn, /raw/)
})

test('run, death, and funnel events roll up without mixing in another game', () => {
  const agg = emptyAgg()
  applyEvent(agg, ev('load', { touch: false, pointer: 'fine', form: 'desktop' }))
  applyEvent(agg, ev('session_start'))
  applyEvent(agg, ev('run_start', { gapMs: 2500, mode: 'daily' }))
  applyEvent(agg, ev('milestone', { step: 'dive' }))
  applyEvent(agg, ev('milestone', { step: 'launch' }))
  applyEvent(agg, ev('milestone', { step: 'perfect' }))
  applyEvent(agg, ev('run_end', {
    cause: 'beach', score: 1200, distance: 900, seconds: 62, airtime: 21.5,
    dives: 8, perfects: 3, coins: 4, launches: 6, mode: 'daily'
  }))
  applyEvent(agg, ev('run_start', { mode: 'free' }, { clientId: 'client-b', sessionId: 'session-b' }))
  applyEvent(agg, ev('run_end', {
    cause: 'night', score: 400, distance: 300, seconds: 40, airtime: 10,
    dives: 2, perfects: 0, coins: 1, launches: 1, mode: 'free'
  }, { clientId: 'client-b', sessionId: 'session-b' }))
  applyEvent(agg, ev('abandon', { location: 'play', durationMs: 8000 }))
  applyEvent(agg, ev('session_end', { durationMs: 9000 }))
  applyEvent(agg, ev('lb_open'))
  applyEvent(agg, ev('lb_submit', { qualified: true }))
  applyEvent(agg, ev('mute', { muted: true }))

  const summary = summarize([agg], { scanComplete: true })
  assert.equal(summary.gameVersion, GAME_VERSION)
  assert.equal(summary.runs, 2)
  assert.equal(summary.runsEnded, 2)
  assert.equal(summary.avgScore, 800)
  assert.equal(summary.maxScore, 1200)
  assert.equal(summary.avgDistance, 600)
  assert.equal(summary.maxDistance, 900)
  assert.equal(summary.avgAirtime, 15.8)
  assert.equal(summary.avgDives, 5)
  assert.equal(summary.avgPerfects, 1.5)
  assert.equal(summary.deathCause.beach, 1)
  assert.equal(summary.deathCause.night, 1)
  assert.equal(summary.byMode.daily, 1)
  assert.equal(summary.byMode.free, 1)
  assert.equal(summary.milestones.dive, 1)
  assert.equal(summary.milestones.launch, 1)
  assert.equal(summary.milestones.perfect, 1)
  assert.equal(summary.abandonsDuringRun, 1)
  assert.equal(summary.sessionsMeasured, 1)
  assert.equal(summary.leaderboardOpens, 1)
  assert.equal(summary.leaderboardSubmits, 1)
  assert.equal(summary.mutes, 1)
  assert.equal(summary.loadsByForm.desktop, 1)
})

test('live fold stores agg shards and does not require a second game table', async () => {
  const store = memoryStore()
  await foldLive(store, 'pw-player', [
    ev('run_end', { cause: 'beach', score: 10, distance: 8, seconds: 3, airtime: 1, dives: 1, perfects: 0, coins: 0, launches: 0, mode: 'daily' }, { clientId: 'pw-player' })
  ])
  const shard = await store.get('agg:pw', { type: 'json' })
  assert.equal(shard.runsEnded, 1)
  assert.equal(shard.distanceSum, 8)
  const summary = summarize([shard], { scanComplete: true })
  assert.equal(summary.avgDistance, 8)
})
