# Simulation & Balance Tool — Setup & Usage Guide

## Prerequisites

- **Node.js 18+** and **pnpm** installed
- **Docker Desktop** running (required for local Supabase)
- **Supabase CLI** installed:
  ```bash
  npm install -g supabase
  ```
  Verify: `supabase --version`

---

## Part 1: Initial Supabase Setup

### 1.1 Start local Supabase

From the project root:

```bash
cd packages/supabase
supabase start
```

This pulls Docker images on first run (may take a few minutes). When complete, it prints connection details:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
        anon key: eyJ...
service_role key: eyJ...
```

**Save the `API URL` and `service_role key`** — you'll need them in the next step.

### 1.2 Apply database migrations

The migrations run automatically on `supabase start`. If you need to re-apply them:

```bash
cd packages/supabase
supabase db reset
```

This drops and recreates the database, running all 7 migrations including the simulation tables (`007_simulation_tables.sql`).

### 1.3 Verify tables exist

Open Supabase Studio at **http://localhost:54323** and check the Table Editor. You should see these simulation tables:

- `game_configs`
- `simulation_runs`
- `match_results`
- `match_player_stats`
- `match_round_details`

---

## Part 2: Tools Server Setup

### 2.1 Configure environment

```bash
cd packages/tools
cp .env.example .env
```

Edit `.env` with your local Supabase credentials:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<paste your service_role key from step 1.1>
PORT=3001
VITE_API_URL=http://localhost:3001
```

### 2.2 Install dependencies

From the project root:

```bash
pnpm install
```

### 2.3 Start the dev environment

The easiest way — runs both the Express backend (port 3001) and Vite frontend (port 5173):

```bash
cd packages/tools
pnpm dev:all
```

Or start them separately in two terminals:

```bash
# Terminal 1: Backend
cd packages/tools && pnpm server:dev

# Terminal 2: Frontend
cd packages/tools && pnpm dev
```

### 2.4 Verify everything is running

- **Backend health check**: http://localhost:3001/api/health → `{"status":"ok"}`
- **Frontend dashboard**: http://localhost:5173
- **Supabase Studio**: http://localhost:54323

---

## Part 3: Running Your First Simulation

### 3.1 Create a game config

Before running simulations, you need a saved GameConfig in the database.

1. Open the dashboard at **http://localhost:5173**
2. Click the **Config Editor** tab
3. The editor loads the default baseline config automatically
4. Give it a name (e.g., "baseline") and version (e.g., "1.0.0")
5. Click **Save**

This stores the full game config (all affixes, combinations, synergies, base items, and balance settings) in the `game_configs` table.

### 3.2 Run a simulation

1. Click the **Simulation** tab
2. Select your saved config from the dropdown
3. Configure parameters:
   - **Match Count**: Start with 1,000 for quick results, up to 50,000 for statistical significance
   - **AI Tier P0 / P1**: 1 (random) through 5 (strongest). Use tier 3 vs 3 for balanced testing.
   - **Seed Start**: 0 (change to get different random seeds)
4. Click **Run Simulation**
5. Watch the progress bar — the backend distributes work across CPU cores via worker threads

### 3.3 View results

Once complete, navigate through the analytics tabs:

| Tab | What it shows |
|-----|---------------|
| **Overview** | Summary cards: total matches, win rates, avg duration, most picked affix |
| **Balance** | Affix win rate matrix, archetype matchup heatmap, must-pick/never-pick flags |
| **Rounds** | Per-round win rates, duration, damage. Comeback rate tracking. |
| **Distributions** | Duration histograms, round count distributions |
| **Meta Evolution** | Compare results across config versions side-by-side |
| **Inspector** | Search and drill into individual matches with full loadout details |

---

## Part 4: Iterating on Balance

This is the core workflow — tweak config, re-run, compare results.

### 4.1 Fork a config

1. Go to **Config Editor**
2. Load your baseline config
3. Click **Fork** — this creates a copy linked to the parent
4. Give it a descriptive name (e.g., "nerf-fire-v1")

### 4.2 Make changes

**Form Mode** (default): Use the tree navigation on the left to find what you want to change:
- **Affixes → Offensive → Sharpness → Tier 2**: Change the value from 8 to 6
- **Balance → Stat Caps → critChance**: Lower from 0.95 to 0.80
- **Balance → Flux Per Round**: Adjust how much forge currency players get

**Raw Mode**: Toggle to the Monaco JSON editor for structural changes — add new affixes, new combinations, or bulk-edit multiple values at once.

### 4.3 Validate and save

1. Click **Validate** — runs Zod schema validation to catch structural errors
2. Fix any red-highlighted issues
3. Click **Save**

### 4.4 Run a comparison simulation

1. Go to **Simulation** tab
2. Select your new config
3. Run with the same parameters as your baseline (same match count, AI tiers, seed)
4. Go to **Meta Evolution** tab
5. Select both configs (baseline + your fork) to see side-by-side comparison

### 4.5 Export results

Every chart and table has export buttons:
- **Export CSV**: Download data as a spreadsheet-compatible file
- **Export PNG**: Download chart images for reports or sharing

---

## Part 5: Understanding the Analytics

### Balance Tab — What to look for

**Win Rate Matrix**: Shows each affix's pick rate and win rate across all simulated matches.
- Win rate significantly above 55% → affix may be overpowered
- Win rate below 45% → affix may be underpowered
- Pick rate above 60% → "must-pick" — too dominant, needs nerf
- Pick rate below 5% → "never-pick" — too weak or too niche

**Matchup Heatmap**: Shows win rates between archetype strategies.
- Cells near 50% = healthy rock-paper-scissors balance
- Cells above 60% = one archetype hard-counters another
- A row that's all green = that archetype dominates everything

**First-Player Advantage**: P0 win rate should be near 50%.
- Green badge (48-52%) = balanced
- Yellow badge (45-55%) = slight advantage, monitor it
- Red badge = significant advantage, investigate draft/forge mechanics

### Rounds Tab — What to look for

- **Round 1 vs Round 3 win rates**: Should be similar. Big shifts suggest snowball effects.
- **Comeback rate**: How often does the R1 loser win the match? Healthy range: 30-45%.
- **Avg damage by round**: Should increase as players forge stronger items.

### Distributions Tab — What to look for

- **Duration histogram**: Should be roughly normal. A spike at max ticks means many matches are timing out (balance issue).
- **Round count distribution**: In best-of-3, you want a healthy mix of 2-round and 3-round matches.

---

## Part 6: Quick Reference

### Common commands

```bash
# Start everything
cd packages/tools && pnpm dev:all

# Start Supabase (if stopped)
cd packages/supabase && supabase start

# Stop Supabase
cd packages/supabase && supabase stop

# Reset database (re-runs all migrations)
cd packages/supabase && supabase db reset

# Run integration test (requires server + Supabase running)
cd packages/tools && npx vitest run server/integration.test.ts

# Run worker pool unit test
cd packages/tools && npx vitest run server/worker-pool.test.ts

# Build the frontend
cd packages/tools && pnpm build
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/configs` | List all saved configs |
| GET | `/api/configs/:id` | Get full config by ID |
| POST | `/api/configs` | Create a new config |
| POST | `/api/simulations` | Start a simulation run |
| GET | `/api/simulations/:id` | Get run status |
| GET | `/api/simulations/:id/progress` | SSE progress stream |
| POST | `/api/simulations/:id/cancel` | Cancel a running simulation |
| GET | `/api/reports/overview` | Aggregate stats |
| GET | `/api/reports/affix-stats` | Affix pick/win rates |
| GET | `/api/reports/matchups` | Archetype matchup matrix |
| GET | `/api/reports/round-stats` | Per-round breakdowns |
| GET | `/api/reports/distributions` | Raw data for histograms |
| GET | `/api/reports/config-comparison` | Cross-config comparison |
| GET | `/api/reports/matches` | Paginated match list |
| GET | `/api/reports/matches/:id` | Single match detail |

All report endpoints accept query params: `runId`, `configId`, `source`, `dateFrom`, `dateTo`, `winner`.

### Ports

| Service | Port |
|---------|------|
| Supabase API | 54321 |
| Supabase DB (Postgres) | 54322 |
| Supabase Studio | 54323 |
| Tools Backend (Express) | 3001 |
| Tools Frontend (Vite) | 5173 |

---

## Troubleshooting

**"Connection refused" on localhost:3001**
→ The backend server isn't running. Run `pnpm server:dev` from `packages/tools/`.

**"Insert into game_configs failed"**
→ Supabase isn't running or `.env` credentials are wrong. Check `supabase status` and verify your `.env` file.

**Worker pool tests fail**
→ Make sure `pnpm install` was run from the project root so `@alloy/engine` is linked.

**Simulation hangs at 0%**
→ Check the server terminal for errors. Common cause: Supabase connection issue (the simulation runs but can't persist results).

**"supabase: command not found"**
→ Install the Supabase CLI: `npm install -g supabase`

**Docker not running**
→ Supabase requires Docker. Start Docker Desktop before running `supabase start`.
