# Token Refresh Service (Bun + Hono + SQLite)

Provider-agnostic OAuth token refresh service with WHOOP and Strava support.

## Stack

- Bun
- Hono
- SQLite (`bun:sqlite`)

## Files

- `src/index.ts` - main Hono app
- `src/providers/index.ts` - provider registry + interface
- `src/providers/whoop.ts` - WHOOP OAuth config
- `src/providers/strava.ts` - Strava OAuth config
- `src/db.ts` - SQLite setup + helpers
- `src/middleware.ts` - API key auth middleware
- `src/refresh.ts` - auto-refresh background job
- `Dockerfile`
- `docker-compose.yml`
- `.env.example`

## Environment

Copy `.env.example` to `.env` and set values:

- `API_KEY` (required)
- `BASE_URL` (example: `https://token-refresh.zeko.run`)
- `DATABASE_PATH` (default: `./data/tokens.db`)
- `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`

## Install and run

```bash
bun install
bun run src/index.ts
```

App listens on port `3000` by default.

## Routes

### Public

- `GET /` - index page with available providers
- `GET /auth/:provider` - redirect to OAuth consent
- `GET /auth/:provider/callback` - exchange authorization code and store tokens

### Private (`X-Api-Key` required)

- `GET /tokens/:provider` - get current token details
- `POST /refresh/:provider` - force refresh token
- `GET /status` - provider health overview

## Token storage

SQLite table:

```sql
CREATE TABLE tokens (
  provider TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT,
  token_type TEXT DEFAULT 'bearer',
  updated_at INTEGER NOT NULL
);
```

## Auto-refresh

Background job runs every 30 minutes and refreshes tokens expiring within 60 minutes.

## Docker

```bash
docker compose up --build
```

The SQLite data is persisted via `./data:/app/data`.
