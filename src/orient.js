// Phones and tablets play in landscape. A portrait handheld is blocked until
// the player turns the device. A desktop window is left alone.

export function shouldBlockForRotate(env) {
  return !!(env && env.handheld && env.portrait)
}

export function readOrient() {
  const nav = globalThis.navigator || {}
  const scr = globalThis.screen || {}
  const match = (q) => {
    try {
      return !!(globalThis.matchMedia && globalThis.matchMedia(q).matches)
    } catch {
      return false
    }
  }
  const coarse = match('(pointer: coarse)')
  const touch = (nav.maxTouchPoints || 0) > 0
  const shortSide = Math.min(scr.width || 0, scr.height || 0)
  const handheld = coarse || (touch && shortSide > 0 && shortSide <= 1024)
  const portrait = match('(orientation: portrait)')
  return { handheld, portrait, coarse, touch }
}

// Screen Orientation lock usually works only from a user gesture, and it
// rejects when the browser or the page is not allowed to rotate.
export function lockLandscape(screenObj) {
  const scr = screenObj || (globalThis.screen)
  const o = scr && scr.orientation
  if (!o || typeof o.lock !== 'function') return Promise.resolve(false)
  try {
    const result = o.lock('landscape')
    if (result && typeof result.then === 'function') {
      return result.then(() => true, () => false)
    }
    return Promise.resolve(true)
  } catch {
    return Promise.resolve(false)
  }
}
