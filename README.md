# Puffwing

A cozy Tiny Wings-style hill glider for the web. Dive down slopes, chain perfect swoops, outrun the sunset — and race today's #1 player as a translucent ghost.

Built with three.js, Vite, and Supabase. Deploys to Netlify as a static site.

## Play

- **Desktop:** hold `SPACE` (or the on-screen **HOLD** button, or click and hold) to dive. Release on an uphill to launch.
- **Mobile:** hold the **HOLD** button, or touch and hold the screen, to dive.

The current build is `v1.3.0` (see the title card and the DIVE pill).

Land while moving fast on a **downhill** for a **PERFECT** boost (+ speed + daylight). Chain 3 perfects to enter **FEVER** (rainbow trail, coin magnet). When the sun sets and you come to rest, the flight ends.

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

`npm run dev` reads those from `.env`. A Netlify deploy has no build step, so the page instead asks `/api/supabase-config` for the same variable names. No new SQL is required — [`supabase/schema.sql`](supabase/schema.sql) is unchanged.

## Analytics

Same pipeline as Sonar Snake, with its own blob store so the games do not share rows:

- Client id in `localStorage` key `pw_cid`, plus a per-tab session id
- `GAME_VERSION` (`src/version.js`) is sent with every batch
- `POST /api/analytics` with `{ clientId, sessionId, gameVersion, events }`
- Flushed every 10 events, every 15s, and via `sendBeacon` when the tab hides
- Raw events `e:<t>:<rnd>`, rolled up into `agg:<shard>` / `leg:<shard>` / `aggmeta`
- Store name: `puffwing-analytics`
- `GET /api/analytics` (and `?raw=1`) requires `Authorization: Bearer $ANALYTICS_TOKEN`

Events: `load`, `session_start`, `session_ping`, `session_end`, `abandon`, `run_start`, `run_end` (distance, score, seconds, cause, airtime, dives, perfects, coins, launches, mode), `milestone` (dive, launch, perfect, fever, night), `lb_open`, `lb_submit`, `mute`, and the ad events below.

No analytics SQL. Set `ANALYTICS_TOKEN` in the Netlify UI when you want to read the summary.

## Ads

`GET /api/ads-config` serves AdSense H5 Games settings. Ads stay **off** unless `ADSENSE_CLIENT` is a real `ca-pub-…` id (optional `ADSENSE_CHANNEL`, `ADSENSE_HOST`, `ADSENSE_FREQUENCY_HINT`, `ADSENSE_TEST`). [`ads.config.json`](ads.config.json) is an empty fallback and must not contain a made-up publisher id. A break can run only between flights (`next-flight` when the player hits Fly again). It never runs during a flight or a ghost replay.

## Deploy to Netlify

This is a static site, like Sonar Snake. [`netlify.toml`](netlify.toml) publishes `.` and sets **no build command**. Functions live in `netlify/functions` (`/api/analytics`, `/api/ads-config`, `/api/supabase-config`).

1. Import the repo in Netlify.
2. If the UI suggests a Vite build (`npm run build`, publish `dist`), clear the build command and set the publish directory to `.` so it matches `netlify.toml`.
3. Optional env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANALYTICS_TOKEN`, `ADSENSE_CLIENT`.

`npm run dev` is only for local play. The deployed site loads `three` and Supabase from the import map in `index.html`.

## Tests

```bash
npm test
```

`node --test` runs `test/*.test.js`: physics (hold vs glide, launch), a Chrome test that sends a real Space key while the play button is focused, analytics rollup, ads staying off, and `GAME_VERSION`.

```bash
npm run smoke
```

Simulates full runs headlessly (physics, scoring, determinism, termination).

## Structure

```
src/
  main.js          entry: loop, input, UI wiring, audio, popups
  version.js       GAME_VERSION
  analytics.js     client id, event queue, beacon
  ads.js           H5 ad breaks between flights only
  game.js          Run: physics stepping, scoring, day/night, ghost playback, recording
  physics.js       dive gravity, swoop, launch
  terrain.js       seeded endless hills, coin arcs, decor placement (pure)
  world.js         three.js rendering: terrain ribbons, decor/coin pools, sky, sun/moon/stars, clouds, particles
  bird.js          the chubby bird (and its ghost)
  leaderboard.js   Supabase client + localStorage fallback
  rng.js           seeded hashing
netlify/functions/ analytics, ads config, public Supabase config
```

Replays are sampled every 150 ms as a flat `[x, y, x, y, …]` array — a full run is ~10 KB of JSON.

## Tuning

Feel knobs live in `src/physics.js` (`GLIDE_G`, `HOLD_G`, launch pop) and `src/game.js` (`DAY_LENGTH`, perfect thresholds, fever rules, day bonuses).
