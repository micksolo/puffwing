import { GAME_VERSION } from './version.js'

const CID_KEY = 'pw_cid'

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2)
}

let cid = localStorage.getItem(CID_KEY)
if (!cid) {
  cid = uuid()
  try { localStorage.setItem(CID_KEY, cid) } catch {}
}
const sid = uuid()
const sessionStartT = Date.now()
const aq = []
let leaveTracked = false
let getState = () => ({ location: 'start', score: 0, distance: 0, runs: 0 })

export function track(name, props) {
  aq.push({ name, props: props || {}, t: Date.now() })
  if (aq.length >= 10) flushAnalytics()
}

export function flushAnalytics(beacon) {
  if (!aq.length) return
  const body = JSON.stringify({
    clientId: cid,
    sessionId: sid,
    gameVersion: GAME_VERSION,
    events: aq.splice(0, aq.length)
  })
  try {
    if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }))
    else fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {}
}

export function deviceProps() {
  const ua = navigator.userAgent || ''
  const touchPoints = navigator.maxTouchPoints || 0
  const coarse = matchMedia('(pointer:coarse)').matches
  const fine = matchMedia('(pointer:fine)').matches
  let pointer = 'none'
  if (coarse && fine) pointer = 'both'
  else if (coarse) pointer = 'coarse'
  else if (fine) pointer = 'fine'
  const phone = /Mobi|iPhone|iPod|Android.+Mobile|Windows Phone/i.test(ua)
  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (/Macintosh/i.test(ua) && touchPoints > 1)
  return {
    touch: coarse,
    pointer,
    touchPoints,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    vw: innerWidth,
    vh: innerHeight,
    sw: screen.width || 0,
    sh: screen.height || 0,
    form: phone ? 'phone' : tablet ? 'tablet' : 'desktop',
    lang: (navigator.language || '').slice(0, 8)
  }
}

export function noteSession(reason) {
  if (leaveTracked) return
  leaveTracked = true
  const now = Date.now()
  const durationMs = Math.max(0, now - sessionStartT)
  const s = getState() || {}
  track('abandon', {
    location: s.location || 'start',
    durationMs,
    score: s.score || 0,
    distance: s.distance || 0,
    reason
  })
  track('session_end', {
    durationMs,
    location: s.location || 'start',
    runs: s.runs || 0,
    reason
  })
}

function sessionPing() {
  if (leaveTracked) return
  const s = getState() || {}
  track('session_ping', { durationMs: Math.max(0, Date.now() - sessionStartT), location: s.location || 'start' })
}

export function startAnalytics(readState) {
  getState = readState || getState
  setInterval(() => flushAnalytics(), 15000)
  setInterval(sessionPing, 30000)
  addEventListener('pagehide', () => { noteSession('pagehide'); flushAnalytics(true) })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sessionPing()
      flushAnalytics(true)
    }
  })
  track('session_start', {})
  track('load', deviceProps())
}
