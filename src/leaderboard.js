import { createClient } from '@supabase/supabase-js'

const env = import.meta.env || {}
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
const client = url && key ? createClient(url, key) : null

export const online = !!client

export async function fetchDaily(day) {
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
