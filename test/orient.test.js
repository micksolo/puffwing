import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { lockLandscape, shouldBlockForRotate } from '../src/orient.js'

test('a portrait phone is blocked and a landscape phone is not', () => {
  assert.equal(shouldBlockForRotate({ handheld: true, portrait: true }), true)
  assert.equal(shouldBlockForRotate({ handheld: true, portrait: false }), false)
  assert.equal(shouldBlockForRotate({ handheld: false, portrait: true }), false)
  assert.equal(shouldBlockForRotate({ handheld: false, portrait: false }), false)
})

test('landscape lock asks the Screen Orientation API and survives a rejection', async () => {
  let asked = null
  const ok = await lockLandscape({
    orientation: { lock: (mode) => { asked = mode; return Promise.resolve() } }
  })
  assert.equal(ok, true)
  assert.equal(asked, 'landscape')

  const missing = await lockLandscape({})
  assert.equal(missing, false)
  const rejected = await lockLandscape({
    orientation: { lock: () => Promise.reject(new Error('not allowed')) }
  })
  assert.equal(rejected, false)
})

test('the page locks landscape, blocks portrait, and disables page zoom', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const css = fs.readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const orient = fs.readFileSync(new URL('../src/orient.js', import.meta.url), 'utf8')
  assert.match(html, /user-scalable=no/)
  assert.match(html, /maximum-scale=1/)
  assert.match(html, /viewport-fit=cover/)
  assert.match(html, /id="rotateoverlay"/)
  assert.match(html, /Rotate your phone/)
  assert.match(css, /touch-action:\s*none/)
  assert.match(css, /overscroll-behavior:\s*none/)
  assert.match(css, /orientation:\s*portrait/)
  assert.match(css, /safe-area-inset-right/)
  assert.match(orient, /lock\('landscape'\)/)
  assert.match(main, /lockLandscape/)
  assert.match(main, /rotateBlocked/)
  assert.match(main, /touchmove/)
})
