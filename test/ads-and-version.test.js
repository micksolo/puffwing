import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { publicAdsConfig } from '../netlify/functions/_shared/ads-config.js'
import { GAME_VERSION } from '../src/version.js'

test('ads stay off unless a real publisher id is configured', () => {
  assert.deepEqual(publicAdsConfig({}), { enabled: false })
  assert.deepEqual(publicAdsConfig({ client: '' }), { enabled: false })
  assert.deepEqual(publicAdsConfig({ client: 'pub-123' }), { enabled: false })
  assert.deepEqual(publicAdsConfig({ client: 'ca-pub-not-real' }), { enabled: false })
  const on = publicAdsConfig({ client: 'ca-pub-1234567890', frequencyHint: '90s', test: 'on' })
  assert.equal(on.enabled, true)
  assert.equal(on.client, 'ca-pub-1234567890')
  assert.equal(on.frequencyHint, '90s')
  assert.equal(on.test, true)

  const file = JSON.parse(fs.readFileSync(new URL('../ads.config.json', import.meta.url), 'utf8'))
  assert.equal(file.client, '')
  assert.equal(publicAdsConfig(file).enabled, false)
  const adsFn = fs.readFileSync(new URL('../netlify/functions/ads-config.js', import.meta.url), 'utf8')
  assert.match(adsFn, /\/api\/ads-config/)
  const client = fs.readFileSync(new URL('../src/ads.js', import.meta.url), 'utf8')
  assert.match(client, /next-flight/)
  assert.match(client, /playing\(\)/)
  assert.equal(client.includes('ca-pub-1234567890'), false)
})

test('the page shows GAME_VERSION and Netlify publishes the repo root with no build', () => {
  assert.equal(GAME_VERSION, '1.3.0')
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const toml = fs.readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(html, /id="ver"/)
  assert.match(html, /id="adslot"/)
  assert.match(html, /id="divepad"/)
  assert.match(main, /GAME_VERSION/)
  assert.match(toml, /publish = "\."/)
  assert.equal(toml.includes('npm run build'), false)
  assert.match(toml, /netlify\/functions/)
  const lb = fs.readFileSync(new URL('../src/leaderboard.js', import.meta.url), 'utf8')
  assert.match(lb, /daily_scores/)
  assert.match(lb, /\/api\/supabase-config/)
  const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  assert.match(schema, /daily_scores/)
})
