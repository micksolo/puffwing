export function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash01(seed, i, salt) {
  let h = (seed ^ Math.imul(i, 2654435761) ^ Math.imul(salt, 40503)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function todayKey(d = new Date()) {
  const z = (x) => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`
}

const HEADS = ['B', 'C', 'D', 'F', 'G', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'W', 'Z']
const MIDS = ['A', 'E', 'I', 'O', 'U', 'Y']
const TAILS = ['B', 'D', 'G', 'K', 'M', 'N', 'P', 'R', 'S', 'T', 'W', 'Z', 'O']

export function randomName() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)]
  return pick(HEADS) + pick(MIDS) + pick(TAILS)
}
