function readName(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
      const v = Netlify.env.get(name)
      if (v != null && String(v) !== '') return String(v)
    }
  } catch {}
  const v = process.env[name]
  return v == null ? '' : String(v)
}

// The anon key is public by design (row level security is the guard). There
// is no build step to inline Vite env vars, so the static page asks for them.
export default async () => {
  const url = readName('VITE_SUPABASE_URL') || readName('SUPABASE_URL')
  const anonKey = readName('VITE_SUPABASE_ANON_KEY') || readName('SUPABASE_ANON_KEY')
  if (!url || !anonKey) return Response.json({ enabled: false }, { headers: { 'cache-control': 'no-store' } })
  return Response.json({ enabled: true, url, anonKey }, { headers: { 'cache-control': 'no-store' } })
}

export const config = { path: '/api/supabase-config' }
