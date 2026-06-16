# helpy-helper

Railway-hosted hub for **Ozioscar / theapp** clients. Replaces the old Wi‑Fi hotspot control panel — devices register over the internet, show up in a dashboard, and accept **global** or **per-device** commands.

**Production URL:** `https://8v10c-px92m.up.railway.app`

## Deploy on Railway

1. Create a new Railway project from this repo.
2. Set environment variables:
   - `HELPY_API_KEY` — secret for dashboard + command API (required in production)
   - `PUBLIC_URL` — optional, e.g. `https://8v10c-px92m.up.railway.app`
   - `PORT` — set automatically by Railway
   - `ONLINE_THRESHOLD_MS` — optional, default `45000` (device online if seen within this window)
   - `CLAIM_TIMEOUT_MS` — optional, default `180000` (stale command claim expiry)
3. Deploy. Railway runs `npm start`.

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/` | — | Web dashboard |
| POST | `/api/devices/register` | — | Client registers `{ deviceId, hostname, user, os, version }` |
| POST | `/api/devices/heartbeat` | — | Client keepalive `{ deviceId }` (optional; poll also updates last seen) |
| GET | `/api/devices` | Bearer | List devices (online if seen within threshold) |
| POST | `/api/commands` | Bearer | Queue command `{ target: "all" \| deviceId, action, payload }` |
| GET | `/api/commands/poll?deviceId=` | — | Client polls pending commands |
| POST | `/api/commands/:id/ack` | — | Client ack `{ deviceId, deviceName?, action?, result }` |
| GET | `/api/commands` | Bearer | Recent command history |
| GET | `/api/inbox/:deviceId` | Bearer | One-time read of last ack result for a device (cleared after read) |

### Headers

- **`Authorization: Bearer <HELPY_API_KEY>`** — required for admin routes when `HELPY_API_KEY` is set
- **`X-Ozioscar-Device: <hostname>`** — optional on client routes; must match the registered hostname when present

### Command actions

`drift/start`, `drift/stop`, `flash/start`, `flash/stop`, `scare`, `rate`, `whoopsie/start`, `whoopsie/stop`, `open`, `close`, `kill`, `list-processes`, `shutdown`, `israel`, `remove`, `bsod`

Payload fields match the Ozioscar control panel (e.g. `direction`, `speed`, `mbs`, `app`, `pid`, `confirm`, BSOD ack flags).

## Client (theapp)

Point theapp at the hub (`AppConstants.RailwayHubUrl`). On startup it:

1. Registers a stable device ID (stored in `C:\Program Files\Ozioscar\device.id`)
2. Polls `/api/commands/poll` every 3 seconds
3. Executes commands locally and acks results to `/api/commands/:id/ack`

The dashboard reads large results (e.g. process lists) via `/api/inbox/:deviceId`.

No hotspot required for remote control.

## Local dev

```bash
npm install
HELPY_API_KEY=devsecret npm run dev
```

Open `http://localhost:3000`, enter API key `devsecret`.

## Security note

Set `HELPY_API_KEY` on Railway. Without it, the admin API is open. Only install theapp on machines you own and control.
