import * as THREE from 'three'
import { World } from './world.js'
import { GAME_VERSION } from './version.js'
import { createBird, animateBird } from './bird.js'
import { Run, frameDistance } from './game.js'
import * as lb from './leaderboard.js'
import { todayKey, hashString, randomName } from './rng.js'
import { track, startAnalytics } from './analytics.js'
import { initAds, gateNextFlight } from './ads.js'

const $ = (s) => document.getElementById(s)

const canvas = $('c')
canvas.tabIndex = 0
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 2000)
scene.add(new THREE.HemisphereLight('#dff4ff', '#9fe6c4', 0.95))
const sunLight = new THREE.DirectionalLight('#fff2d0', 1.1)
sunLight.position.set(20, 40, 60)
scene.add(sunLight)

const today = todayKey()
const seedToday = hashString(today)

const state = {
  screen: 'start',
  run: null,
  boardRows: [],
  boardSource: 'local',
  ghostOn: localStorage.getItem('puffwing.ghost') !== '0',
  milestones: {},
  runs: 0
}
let lastRunEndT = null

startAnalytics(() => {
  const run = state.run
  return {
    location: state.screen,
    score: run ? run.score : 0,
    distance: run ? run.distance : 0,
    runs: state.runs
  }
})
initAds()

function milestone(step) {
  if (state.milestones[step]) return
  state.milestones[step] = true
  track('milestone', { step })
}

const world = new World(scene, seedToday)
const bird = createBird()
scene.add(bird.group)
const ghostBird = createBird({ ghost: true })
ghostBird.group.visible = false
scene.add(ghostBird.group)

function resize() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.fov = camera.aspect < 0.85 ? 74 : 56
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const input = { hold: false }
const divePad = $('divepad')

function typingTarget(el) {
  if (!el || !el.tagName) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

function grabFocus() {
  const ae = document.activeElement
  if (ae && ae !== canvas && typeof ae.blur === 'function') ae.blur()
  try { canvas.focus({ preventScroll: true }) } catch { canvas.focus() }
}

function setHold(next) {
  if (state.screen !== 'play') {
    input.hold = false
    return
  }
  input.hold = !!next
  if (next) {
    $('hint').classList.add('hidden')
    resumeAudio()
  }
}

function pointerHold(e) {
  if (state.screen !== 'play') return
  if (e.target.closest && e.target.closest('button, input, a, label')) return
  e.preventDefault()
  setHold(true)
}

addEventListener('pointerdown', pointerHold)
addEventListener('pointerup', () => { if (!input.keys) input.hold = false })
addEventListener('pointercancel', () => { if (!input.keys) input.hold = false })
divePad.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  e.stopPropagation()
  try { divePad.setPointerCapture(e.pointerId) } catch {}
  setHold(true)
})
divePad.addEventListener('pointerup', (e) => {
  if (!input.keys) input.hold = false
  try { divePad.releasePointerCapture(e.pointerId) } catch {}
})
divePad.addEventListener('pointercancel', () => { if (!input.keys) input.hold = false })

const isDiveKey = (e) =>
  e.code === 'Space' || e.code === 'ArrowDown' || e.key === ' ' || e.key === 'ArrowDown' || e.keyCode === 32 || e.keyCode === 40

// Capture phase runs before a focused button turns Space into a click,
// which used to restart the flight (or scroll) and clear the dive.
addEventListener('keydown', (e) => {
  if (!isDiveKey(e)) return
  if (typingTarget(document.activeElement)) return
  if (state.screen !== 'play') return
  e.preventDefault()
  e.stopPropagation()
  input.keys = true
  setHold(true)
}, true)
addEventListener('keyup', (e) => {
  if (!isDiveKey(e)) return
  if (state.screen === 'play') {
    e.preventDefault()
    e.stopPropagation()
  }
  input.keys = false
  input.hold = false
}, true)
addEventListener('blur', () => { input.hold = false; input.keys = false })
addEventListener('contextmenu', (e) => e.preventDefault())

const audio = { ctx: null, muted: localStorage.getItem('puffwing.mute') === '1' }
function actx() {
  if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (audio.ctx.state === 'suspended') audio.ctx.resume()
  return audio.ctx
}
function resumeAudio() {
  if (!audio.muted) actx()
}
function tone(f0, f1, dur, type = 'sine', vol = 0.06, delay = 0) {
  if (audio.muted || !window.AudioContext) return
  const a = actx()
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}
const sCoin = () => tone(1050, 1400, 0.09, 'triangle', 0.05)
const sPerfect = (c) => {
  const base = 480 * Math.pow(1.12, Math.min(c, 8))
  tone(base, base * 1.3, 0.12, 'sine', 0.07)
  tone(base * 1.5, base * 1.9, 0.14, 'sine', 0.055, 0.07)
}
const sBump = () => tone(160, 90, 0.16, 'sawtooth', 0.04)
const sNight = () => tone(700, 350, 0.5, 'sine', 0.05)
const sFever = () => {
  tone(660, 660, 0.08, 'triangle', 0.06)
  tone(880, 880, 0.08, 'triangle', 0.06, 0.09)
  tone(1100, 1100, 0.12, 'triangle', 0.06, 0.18)
}
const sStart = () => {
  tone(440, 660, 0.12, 'triangle', 0.055)
  tone(660, 880, 0.14, 'triangle', 0.055, 0.11)
}
const sEnd = () => {
  tone(520, 260, 0.4, 'sine', 0.05)
  tone(390, 195, 0.5, 'sine', 0.045, 0.25)
}

const muteBtn = $('mute')
function applyMuteIcon() {
  $('sndon').style.display = audio.muted ? 'none' : 'block'
  $('sndoff').style.display = audio.muted ? 'block' : 'none'
}
muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted
  localStorage.setItem('puffwing.mute', audio.muted ? '1' : '0')
  applyMuteIcon()
  track('mute', { muted: audio.muted })
  if (!audio.muted) tone(880, 880, 0.08, 'triangle', 0.05)
})
applyMuteIcon()

const nameInput = $('name')
nameInput.value = localStorage.getItem('puffwing.name') || randomName()
nameInput.addEventListener('input', () => {
  nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
  localStorage.setItem('puffwing.name', nameInput.value)
})
function getName() {
  return nameInput.value.trim() || randomName()
}

const ghostCheckbox = $('ghoston')
ghostCheckbox.checked = state.ghostOn
ghostCheckbox.addEventListener('change', () => {
  state.ghostOn = ghostCheckbox.checked
  localStorage.setItem('puffwing.ghost', state.ghostOn ? '1' : '0')
})

const popV = new THREE.Vector3()
function pop(x, y, text, cls = '') {
  popV.set(x, y, 1.2).project(camera)
  const el = document.createElement('div')
  el.className = 'pop ' + cls
  el.textContent = text
  el.style.left = ((popV.x * 0.5 + 0.5) * innerWidth) + 'px'
  el.style.top = ((-popV.y * 0.5 + 0.5) * innerHeight) + 'px'
  $('popups').appendChild(el)
  setTimeout(() => el.remove(), 1200)
}
function popCenter(text, cls = '') {
  const el = document.createElement('div')
  el.className = 'pop ' + cls
  el.textContent = text
  el.style.left = '50%'
  el.style.top = '38%'
  $('popups').appendChild(el)
  setTimeout(() => el.remove(), 1200)
}

const feverColor = new THREE.Color()
function processEvents(run) {
  for (const e of run.drainEvents()) {
    if (e.type === 'perfect') {
      milestone('perfect')
      pop(e.x, e.y, 'PERFECT' + (e.combo > 1 ? ' ×' + e.combo : ''))
      world.emit(e.x, e.y, { count: 12, color: '#ffd1e0', spread: 6, up: 4 })
      sPerfect(e.combo)
    } else if (e.type === 'coin') {
      pop(e.x, e.y, '+50', 'pop-coin')
      world.emit(e.x, e.y, { count: 8, color: '#ffe38a', spread: 4, up: 3 })
      sCoin()
    } else if (e.type === 'bump') {
      world.emit(e.x, e.y - 0.5, { count: 6, color: '#cbb59a', spread: 5, up: 2, ttl: 0.6 })
      sBump()
    } else if (e.type === 'fever') {
      milestone('fever')
      popCenter('FEVER!', 'pop-fever')
      sFever()
    } else if (e.type === 'feverEnd') {
      $('fevertag').classList.add('hidden')
    } else if (e.type === 'night') {
      milestone('night')
      popCenter('The sun has set…', 'pop-night')
      sNight()
    } else if (e.type === 'launch') {
      milestone('launch')
      pop(e.x, e.y + 1.4, 'SOAR', 'pop-ghost')
    } else if (e.type === 'breeze') {
      pop(e.x, e.y + 2.5, 'a friendly breeze~', 'pop-ghost')
      world.emit(e.x - 2, e.y, { count: 10, color: '#e8f6ff', spread: 6, up: 1.5, grav: false })
      tone(280, 520, 0.3, 'sine', 0.035)
    }
  }
}

const hudCache = {}
function setText(id, text) {
  if (hudCache[id] !== text) {
    hudCache[id] = text
    $(id).textContent = text
  }
}
function hud(run) {
  setText('dist', run.distance + 'm')
  setText('speed', Math.round(run.speed * 3.6) + ' km/h')
  setText('coincount', String(run.coins))
  setText('combo', run.combo >= 2 ? 'combo ×' + run.combo : '')
  const pct = Math.round(run.dayT * 100)
  if (hudCache.day !== pct) {
    hudCache.day = pct
    $('dayfill').style.width = pct + '%'
    $('dayfill').style.background = run.dayT > 0.45
      ? 'linear-gradient(90deg, #ffcf6a, #ffab4d)'
      : 'linear-gradient(90deg, #d88fb5, #7a5fb5)'
    $('sunicon').style.display = run.dayT > 0.2 ? 'block' : 'none'
    $('moonicon').style.display = run.dayT > 0.2 ? 'none' : 'block'
  }
  $('fevertag').classList.toggle('hidden', !run.fever)
}

let hintTimer = null
function showHint() {
  const el = $('hint')
  el.textContent = 'ontouchstart' in window ? 'HOLD TO DIVE' : 'HOLD SPACE TO DIVE'
  el.classList.remove('hidden')
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => el.classList.add('hidden'), 2600)
}

function startRun(mode) {
  const seed = mode === 'daily' ? seedToday : ((Math.random() * 2 ** 31) | 0) >>> 0
  let ghost = null
  if (mode === 'daily' && state.ghostOn && state.boardRows[0] && state.boardRows[0].replay) {
    ghost = { replay: state.boardRows[0].replay }
  }
  state.run = new Run({ seed, mode, ghost })
  state.milestones = {}
  state.runs++
  track('run_start', {
    run: state.runs,
    mode,
    gapMs: lastRunEndT ? Date.now() - lastRunEndT : null,
    ghost: !!ghost
  })
  world.setTerrain(seed)
  input.hold = false
  $('start').classList.add('hidden')
  $('over').classList.add('hidden')
  $('hud').classList.remove('hidden')
  $('fevertag').classList.add('hidden')
  $('divepad').classList.remove('hidden')
  $('ver').textContent = 'v' + GAME_VERSION
  grabFocus()
  showHint()
  state.hint2 = false
  sStart()
  if (ghost && state.boardRows[0]) {
    setTimeout(() => popCenter("racing " + state.boardRows[0].name + "'s ghost", 'pop-ghost'), 600)
  }
  state.screen = 'play'
}

function renderBoard(el, rows, source) {
  if (!rows.length) {
    el.innerHTML = '<div class="empty">No flights yet today — be the first!</div>'
    return
  }
  const myName = nameInput.value.trim()
  el.innerHTML = ''
  rows.forEach((r, i) => {
    const div = document.createElement('div')
    div.className = 'row' + (r.name === myName && myName ? ' me' : '')
    div.innerHTML =
      '<span class="rank">' + (i + 1) + '</span>' +
      '<span class="rname"></span>' +
      '<span class="rscore">' + Number(r.score).toLocaleString() + '</span>' +
      '<span class="rdist">' + Number(r.distance).toLocaleString() + 'm</span>'
    div.querySelector('.rname').textContent = r.name
    el.appendChild(div)
  })
}

async function loadBoard(src) {
  const { source, rows } = await lb.fetchDaily(today)
  state.boardRows = rows
  state.boardSource = source
  renderBoard($('board'), rows, source)
  $('boardsrc').textContent = source === 'local' ? 'local scores — connect Supabase for the global board' : ''
  $('ghostname').textContent = rows[0]
    ? "today's #1: " + rows[0].name + ' · ' + Number(rows[0].score).toLocaleString()
    : 'no ghost yet — set the first flight'
  track('lb_open', { src: src || 'menu' })
}
loadBoard('boot')

async function endRun() {
  state.screen = 'over'
  input.hold = false
  const run = state.run
  lastRunEndT = Date.now()
  track('run_end', {
    cause: run.endCause || 'beach',
    score: run.score,
    distance: run.distance,
    seconds: Math.round(run.time * 10) / 10,
    airtime: Math.round(run.airtime * 10) / 10,
    dives: run.dives,
    perfects: run.perfects,
    coins: run.coins,
    launches: run.launches,
    mode: run.mode
  })
  $('hud').classList.add('hidden')
  $('fevertag').classList.add('hidden')
  $('hint').classList.add('hidden')
  $('holdind').classList.add('hidden')
  $('divepad').classList.add('hidden')
  $('overtitle').textContent = run.postNight > 0 && run.dayLeft <= 0 ? 'Night has fallen' : 'Flight complete'
  $('finalscore').textContent = run.score.toLocaleString()
  $('breakdown').innerHTML =
    '<div><span>Distance</span><b>' + run.distance.toLocaleString() + ' m</b></div>' +
    '<div><span>Coins</span><b>' + run.coins + ' × 50</b></div>' +
    '<div><span>Perfect landings</span><b>' + run.perfects + ' × 100</b></div>' +
    '<div><span>Best combo</span><b>×' + run.maxCombo + '</b></div>'
  const status = $('submitstatus')
  if (run.mode === 'daily') {
    status.textContent = 'submitting…'
    const res = await lb.submitScore({
      day: today,
      name: getName(),
      score: run.score,
      distance: run.distance,
      replay: run.rec
    })
    status.textContent =
      res === 'global' ? 'Score submitted to the global leaderboard!'
      : res === 'local' ? 'Saved locally (offline mode)'
      : 'Could not reach the leaderboard — saved locally'
    track('lb_submit', { score: run.score, source: res, qualified: res === 'global' || res === 'local' })
    await loadBoard('gameover')
    renderBoard($('board2'), state.boardRows, state.boardSource)
  } else {
    status.textContent = 'Practice flight — not submitted'
    renderBoard($('board2'), state.boardRows, state.boardSource)
    track('lb_open', { src: 'gameover' })
  }
  $('over').classList.remove('hidden')
  sEnd()
}

$('playdaily').addEventListener('click', () => startRun('daily'))
$('playfree').addEventListener('click', () => startRun('free'))
$('retry').addEventListener('click', () => {
  const mode = state.run && state.run.mode === 'free' ? 'free' : 'daily'
  gateNextFlight(() => state.screen === 'play', () => startRun(mode))
})
$('menu').addEventListener('click', () => {
  state.screen = 'start'
  state.run = null
  input.hold = false
  $('over').classList.add('hidden')
  $('hud').classList.add('hidden')
  $('divepad').classList.add('hidden')
  $('start').classList.remove('hidden')
  loadBoard('menu')
})
$('ver').textContent = 'v' + GAME_VERSION

const clock = new THREE.Clock()
let menuCam = 0
let lastTele = 0

window.__puffwing = { state, input, world, camera, version: GAME_VERSION, birdRot: 0 }

function fitBird(group, z) {
  const read = Math.min(5.6, Math.max(1, z / 46))
  group.scale.set(group.scale.x * read, group.scale.y * read, read)
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  const el = clock.elapsedTime
  if (state.screen === 'play' && state.run) {
    const run = state.run
    run.update(dt, input.hold)
    processEvents(run)
    world.update(dt, run.camX, run.camY, run.dayT, { bird: run.bird, taken: run.taken })
    bird.group.visible = true
    bird.group.position.set(run.bird.x, run.bird.y, 1.2)
    animateBird(bird, { t: el, vx: run.bird.vx, vy: run.bird.vy, grounded: run.bird.grounded, hold: input.hold })
    const viewZ = frameDistance(run.camZ, camera.aspect)
    fitBird(bird.group, viewZ)
    window.__puffwing.birdRot = bird.group.rotation.z
    if (run.fever) {
      feverColor.setHSL((el * 0.7) % 1, 0.85, 0.62)
      world.emit(run.bird.x - 1, run.bird.y - 0.2, { count: 2, color: feverColor, spread: 1.6, up: 0.5, ttl: 0.9, grav: false })
    }
    const gp = run.ghostPos()
    if (gp && !gp.done) {
      ghostBird.group.visible = true
      ghostBird.group.position.set(gp.x, gp.y, 0.9)
      animateBird(ghostBird, { t: el * 1.1, vx: 10, vy: 0, grounded: false })
      fitBird(ghostBird.group, viewZ)
    } else {
      ghostBird.group.visible = false
    }
    camera.position.set(run.camX, run.camY, viewZ)
    camera.lookAt(run.camX + 6, run.camY - 8, 0)
    hud(run)
    const holdind = $('holdind')
    holdind.classList.toggle('hidden', false)
    holdind.classList.toggle('on', input.hold)
    divePad.classList.toggle('on', input.hold)
    if (el - lastTele > 0.15) {
      lastTele = el
      const b = run.bird
      holdind.textContent = input.hold ? 'DIVING  v' + GAME_VERSION : 'DIVE  v' + GAME_VERSION
    }
    if (!state.hint2 && run.time > 4 && run.bird.grounded && run.speed < 6) {
      state.hint2 = true
      const h = $('hint')
      h.textContent = 'HOLD ON DOWNHILLS · RELEASE ON UPHILLS'
      h.classList.remove('hidden')
      clearTimeout(hintTimer)
      hintTimer = setTimeout(() => h.classList.add('hidden'), 4200)
    }
    if (run.dives > 0) milestone('dive')
    if (run.over && state.screen === 'play') endRun()
  } else {
    menuCam += dt * 3
    world.update(dt, menuCam, 8, 1, { bird: null })
    bird.group.visible = false
    ghostBird.group.visible = false
    $('holdind').classList.add('hidden')
    camera.position.set(menuCam, 10, frameDistance(69, camera.aspect))
    camera.lookAt(menuCam + 10, 2, 0)
  }
  renderer.render(scene, camera)
})
