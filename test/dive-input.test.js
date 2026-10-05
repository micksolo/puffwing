import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'
import WebSocket from 'ws'

const CHROME = process.env.CHROME_PATH || 'google-chrome'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitFor(url, tries = 40) {
  let last = 'not up'
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (r.ok || r.status < 500) return
      last = 'status ' + r.status
    } catch (e) {
      last = e.name || e.message
    }
    await sleep(200)
  }
  throw new Error('timed out waiting for ' + url + ' (' + last + ')')
}

function start(cmd, args) {
  return spawn(cmd, args, { stdio: 'ignore' })
}

async function connectCdp(port) {
  await waitFor(`http://127.0.0.1:${port}/json/version`)
  const list = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json())
  const page = list.find((p) => p.type === 'page')
  if (!page) throw new Error('no chrome page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await once(ws, 'open')
  let id = 0
  const pending = new Map()
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, resolve)
    ws.send(JSON.stringify({ id: mid, method, params }))
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid)
        reject(new Error('cdp timeout ' + method))
      }
    }, 8000)
  })
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''))
    }
    return r.result?.result?.value
  }
  return { ws, send, evalJs }
}

const readBird = `(() => {
  const run = window.__puffwing.state.run
  const b = run.bird
  return {
    y: b.y, x: b.x, vy: b.vy, time: run.time,
    hold: window.__puffwing.input.hold ? 1 : 0,
    rot: window.__puffwing.birdRot,
    screen: window.__puffwing.state.screen
  }
})()`

async function sampleFor(cdp, gameSeconds) {
  const samples = []
  const t0 = await cdp.evalJs('window.__puffwing.state.run.time')
  const start = Date.now()
  while (Date.now() - start < 5000) {
    const s = await cdp.evalJs(readBird)
    samples.push(s)
    if (s.time - t0 >= gameSeconds) break
    await sleep(40)
  }
  return samples
}

async function play(cdp) {
  await cdp.evalJs('document.getElementById("playdaily").click()')
  await sleep(200)
  const screen = await cdp.evalJs('window.__puffwing.state.screen')
  assert.equal(screen, 'play')
}

test('real Space and the hold pad dive; a glide does not', { timeout: 45000 }, async (t) => {
  const vitePort = 4800 + Math.floor(Math.random() * 150)
  const cdpPort = 9400 + Math.floor(Math.random() * 150)
  const vite = start('npx', ['vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'])
  const chrome = start(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--remote-debugging-port=' + cdpPort,
    '--user-data-dir=/tmp/puffwing-chrome-' + cdpPort,
    'about:blank'
  ])
  t.after(() => {
    vite.kill('SIGKILL')
    chrome.kill('SIGKILL')
  })
  await waitFor(`http://127.0.0.1:${vitePort}/`)
  const cdp = await connectCdp(cdpPort)
  t.after(() => { try { cdp.ws.close() } catch {} })
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  async function boot() {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` })
    for (let i = 0; i < 20; i++) {
      const v = await cdp.evalJs('window.__puffwing && window.__puffwing.version')
      if (v) return v
      await sleep(150)
    }
    throw new Error('game did not boot')
  }

  assert.equal(await boot(), '1.2.1')
  await play(cdp)
  // A real player clicks Daily Flight, which leaves that button focused
  // unless we move focus. Put focus back on the button and then hold Space
  // the way the keyboard does, so a swallowed key fails this test.
  await cdp.evalJs('document.getElementById("playdaily").focus()')
  const y0 = await cdp.evalJs('window.__puffwing.state.run.bird.y')
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32
  })
  const held = await sampleFor(cdp, 0.4)
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32
  })
  assert.ok(held.every((s) => s.screen === 'play'), 'space activated the focused button and left the run')
  assert.ok(held.filter((s) => s.hold === 1).length >= 3, 'hold did not stick while Space was down')
  assert.ok(held.some((s) => s.rot < -0.6), 'bird never tucked, rot ' + held.map((s) => s.rot.toFixed(2)).join(','))
  const heldDrop = y0 - Math.min(...held.map((s) => s.y))
  assert.ok(held.at(-1).time - held[0].time > 0.25, 'game clock did not advance while holding')
  assert.ok(heldDrop > 4, 'held drop only ' + heldDrop.toFixed(2) + ' from ' + y0.toFixed(2))

  assert.equal(await boot(), '1.2.1')
  await play(cdp)
  const gy0 = await cdp.evalJs('window.__puffwing.state.run.bird.y')
  const glide = await sampleFor(cdp, 0.4)
  const glideDrop = gy0 - Math.min(...glide.map((s) => s.y))
  assert.ok(heldDrop > glideDrop + 3, `held drop ${heldDrop.toFixed(2)} vs glide drop ${glideDrop.toFixed(2)}`)
  const heldRot = Math.min(...held.map((s) => s.rot))
  const glideRot = Math.min(...glide.map((s) => s.rot))
  assert.ok(heldRot < glideRot - 0.4, `held rot ${heldRot.toFixed(2)} vs glide rot ${glideRot.toFixed(2)}`)

  assert.equal(await boot(), '1.2.1')
  await play(cdp)
  const pad = await cdp.evalJs(`(() => {
    const el = document.getElementById('divepad')
    const r = el.getBoundingClientRect()
    return { hidden: el.classList.contains('hidden'), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }
  })()`)
  assert.equal(pad.hidden, false)
  assert.ok(pad.w > 100 && pad.h > 40, 'on-screen hold area is missing')
  const before = await cdp.evalJs('window.__puffwing.birdRot')
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: pad.x, y: pad.y, button: 'left', clickCount: 1
  })
  await sleep(200)
  const pressing = await cdp.evalJs(readBird)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: pad.x, y: pad.y, button: 'left', clickCount: 1
  })
  await sleep(80)
  const released = await cdp.evalJs('window.__puffwing.input.hold ? 1 : 0')
  assert.equal(pressing.hold, 1)
  assert.equal(pressing.screen, 'play')
  assert.ok(pressing.rot < before - 0.4, 'pad press did not tuck the bird')
  assert.equal(released, 0)
})
