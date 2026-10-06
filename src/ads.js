import { track } from './analytics.js'

let adsReady = false
let adBreakBusy = false

function normalizeAds(raw) {
  if (!raw || typeof raw !== 'object') return { enabled: false }
  const client = String(raw.client || '').trim()
  if (!/^ca-pub-\d{10,22}$/.test(client)) return { enabled: false }
  const cfg = {
    enabled: true,
    client,
    frequencyHint: /^\d{1,4}s$/.test(String(raw.frequencyHint || '').trim()) ? String(raw.frequencyHint).trim() : '120s',
    test: raw.test === true || raw.test === 'on' || raw.test === '1' || raw.test === 'true'
  }
  const channel = String(raw.channel || '').trim()
  const host = String(raw.host || '').trim()
  if (/^\d{1,20}$/.test(channel)) cfg.channel = channel
  if (/^ca-host-pub-\d{1,22}$/.test(host)) cfg.host = host
  return cfg
}

function hideSlot() {
  const slot = document.getElementById('adslot')
  if (slot) slot.hidden = true
}

function armAds(cfg) {
  window.adsbygoogle = window.adsbygoogle || []
  window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o) }
  window.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => { adsReady = true } })
  const s = document.createElement('script')
  s.async = true
  s.crossOrigin = 'anonymous'
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.client)
  s.setAttribute('data-ad-client', cfg.client)
  if (cfg.channel) s.setAttribute('data-ad-channel', cfg.channel)
  if (cfg.host) s.setAttribute('data-ad-host', cfg.host)
  if (cfg.frequencyHint) s.setAttribute('data-ad-frequency-hint', cfg.frequencyHint)
  if (cfg.test) s.setAttribute('data-adbreak-test', 'on')
  document.head.appendChild(s)
  hideSlot()
}

export async function initAds() {
  let cfg = { enabled: false }
  try {
    const r = await fetch('/api/ads-config', { cache: 'no-store' })
    if (r.ok) cfg = normalizeAds(await r.json())
  } catch {}
  if (!cfg.enabled) {
    try {
      const r = await fetch('/ads.config.json', { cache: 'no-store' })
      if (r.ok) cfg = normalizeAds(await r.json())
    } catch {}
  }
  if (cfg.enabled) armAds(cfg)
  else hideSlot()
}

// Full-screen H5 breaks only between flights. A live run, including a ghost
// replay, is never paused for an ad.
export function gateNextFlight(playing, start) {
  if (playing()) {
    return
  }
  if (!adsReady || adBreakBusy || typeof window.adBreak !== 'function') {
    start()
    return
  }
  let began = false
  let finished = false
  const go = () => {
    if (finished || playing()) return
    finished = true
    start()
  }
  const timer = setTimeout(() => { if (!began) go() }, 1200)
  adBreakBusy = true
  try {
    window.adBreak({
      type: 'next',
      name: 'next-flight',
      beforeAd: () => {
        began = true
        clearTimeout(timer)
        track('before_ad', { breakType: 'next', breakName: 'next-flight' })
      },
      afterAd: () => {
        track('after_ad', { breakType: 'next', breakName: 'next-flight' })
      },
      adBreakDone: (info) => {
        clearTimeout(timer)
        adBreakBusy = false
        track('ad_break_done', {
          breakType: String((info && info.breakType) || 'next').slice(0, 24),
          breakName: String((info && info.breakName) || 'next-flight').slice(0, 40),
          breakFormat: String((info && info.breakFormat) || '').slice(0, 24),
          breakStatus: String((info && info.breakStatus) || '').slice(0, 32)
        })
        go()
      }
    })
  } catch {
    clearTimeout(timer)
    adBreakBusy = false
    go()
  }
}
