import { createClient } from '@supabase/supabase-js'

let client = null
let ready = null

function envPair() {
  const env = import.meta.env || {}
  return [env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY]
}

function setClient(url, key) {
  client = url && key ? createClient(url, key) : null
  return client
}

const [bootUrl, bootKey] = envPair()
if (bootUrl && bootKey) setClient(bootUrl, bootKey)

export async function ensureClient() {
  if (client) return client
  if (!ready) {
    ready = (async () => {
      try {
        const r = await fetch('/api/supabase-config', { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          if (j && j.enabled && j.url && j.anonKey) setClient(j.url, j.anonKey)
        }
      } catch {}
      return client
    })()
  }
  return ready
}

export async function fetchDaily(day) {
  await ensureClient()
  if (client) {
    const { data, error } = await client
      .from('daily_scores')
      .select('name,score,distance,replay')
      .eq('day', day)
      .order('score', { ascending: false })
      .limit(10)
    if (!error && data) {
      return {
        source: 'global',
        rows: data.map((r) => ({ name: r.name, score: r.score, distance: r.distance, replay: r.replay }))
      }
    }
  }
  return { source: 'local', rows: localRows(day) }
}

export async function submitScore({ day, name, score, distance, replay }) {
  await ensureClient()
  if (client) {
    const { error } = await client
      .from('daily_scores')
      .insert({ day, name, score, distance, replay })
    if (!error) return 'global'
  }
  saveLocal(day, { name, score, distance, replay })
  return client ? 'local-fallback' : 'local'
}

function localRows(day) {
  try {
    return JSON.parse(localStorage.getItem('puffwing:' + day) || '[]')
  } catch {
    return []
  }
}

function saveLocal(day, row) {
  const rows = localRows(day)
  rows.push({ name: row.name, score: row.score, distance: row.distance, replay: null })
  rows.sort((a, b) => b.score - a.score)
  const top = rows.slice(0, 5)
  if (row.replay && top[0] && top[0].score === row.score) {
    top[0].replay = row.replay
    for (let i = 1; i < top.length; i++) top[i].replay = null
  }
  try {
    localStorage.setItem('puffwing:' + day, JSON.stringify(top))
  } catch {}
}
