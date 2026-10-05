# Puffwing

A cozy Tiny Wings-style hill glider for the web. Dive down slopes, chain perfect swoops, outrun the sunset — and race today's #1 player as a translucent ghost.

Built with three.js, Vite, and Supabase. Deploys to Netlify as a static site.

## Play

- **Desktop:** hold `SPACE` (or click and hold) to dive, release to soar
- **Mobile:** touch and hold anywhere to dive

Land while moving fast on a **downhill** for a **PERFECT** boost (+ speed + daylight). Chain 3 perfects to enter **FEVER** (rainbow trail, coin magnet, no air drag). When the sun sets and you come to rest, the flight ends.

Score = distance + coins × 50 + perfect landings × 100 + best combo × 25.

## The twist: daily runs + ghosts

Every UTC day has one seeded course — everyone in the world flies the same hills. The leaderboard is per-day, and the day's #1 flight is stored as a replay. Enable **Race today's #1 ghost** and a translucent bird flies the leader's exact path alongside you in real time.

`Free Flight` gives you a random course for practice (scores not submitted).

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL (use the network URL to test on your phone on the same Wi-Fi).

## Leaderboard setup (Supabase)

Without Supabase configured, scores and the ghost are stored in `localStorage` on the player's device (offline mode).

1. Create a free project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the contents of [`supabase/schema.sql`](supabase/schema.sql)
3. Copy your project URL and `anon` key (Project Settings → API)
4. Create a `.env` file (see `.env.example`):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Row Level Security is enabled: anyone can read and insert scores, with checks that clamp name length (3), score bounds, and replay size so the anon key is safe to ship to browsers.

## Deploy to Netlify

**Option A — Git:** push this repo to GitHub, then in Netlify: "Import from Git". Build command, publish directory, and Node version are already configured in [`netlify.toml`](netlify.toml). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Site settings → Environment variables, then deploy.

**Option B — CLI:**

```bash
npm i -g netlify-cli
netlify deploy --build --prod
```

**Option C — drag & drop:** run `npm run build` and drop the `dist` folder onto [app.netlify.com/drop](https://app.netlify.com/drop) (set the env vars in the UI afterwards and redeploy).

## Tests

```bash
npm run smoke
```

Simulates full runs headlessly (physics, scoring, determinism, termination) across daily seeds.

`node test/integration.mjs <url>` drives the built game in a real Chrome over CDP: boot → play → input → nightfall → submit → leaderboard → retry. Requires a preview server (`npm run preview`) and a headless Chrome on port 9333.

## Structure

```
src/
  main.js          entry: loop, input, UI wiring, audio, popups
  game.js          Run: physics stepping, scoring, day/night, ghost playback, recording
  physics.js       pure bird-vs-terrain step (dive gravity, slope sliding)
  terrain.js       seeded endless hills, coin arcs, decor placement (pure)
  world.js         three.js rendering: terrain ribbons, decor/coin pools, sky, sun/moon/stars, clouds, particles
  bird.js          the chubby bird (and its ghost)
  leaderboard.js   Supabase client + localStorage fallback
  rng.js           seeded hashing
```

Replays are sampled every 150 ms as a flat `[x, y, x, y, …]` array — a full run is ~10 KB of JSON.

## Tuning

Feel knobs live in `src/physics.js` (gravity, dive multiplier, friction) and `src/game.js` (`DAY_LENGTH`, perfect thresholds, fever rules, day bonuses).
