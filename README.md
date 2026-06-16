# helpy-helper

Railway-hosted hub for **Ozioscar / theapp** clients. Replaces the old Wi‑Fi hotspot control panel — devices register over the internet, show up in a dashboard, and accept **global** or **per-device** commands.

**Production URL:** `https://8v10c-px92m.up.railway.app`

## Deploy on Railway

1. Create a new Railway project from this repo.
2. Set environment variables:
   - `HELPY_API_KEY` — secret for dashboard + command API (required in production)
   - `PUBLIC_URL` — optional, e.g. `https://8v10c-px92m.up.railway.app`
   - `PORT` — set automatically by Railway
3. Deploy. Railway runs `npm start`.

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/` | — | Web dashboard |
| POST | `/api/devices/register` | — | Client registers `{ deviceId, hostname, user, os, version }` |
| POST | `/api/devices/heartbeat` | — | Client heartbeat `{ deviceId }` |
| GET | `/api/devices` | Bearer | List devices (online if seen within 45s) |
| POST | `/api/commands` | Bearer | Queue command `{ target: "all" \| deviceId, action, payload }` |
| GET | `/api/commands/poll?deviceId=` | — | Client polls pending commands |
| POST | `/api/commands/:id/ack` | — | Client ack `{ deviceId, result }` |
| GET | `/api/commands` | Bearer | Recent command history |

### Command actions

`drift/start`, `drift/stop`, `flash/start`, `flash/stop`, `scare`, `rate`, `whoopsie/start`, `whoopsie/stop`, `open`, `close`, `list-processes`, `shutdown`, `israel`, `remove`, `bsod`

Payload fields match the Ozioscar control panel (e.g. `direction`, `speed`, `mbs`, `app`, `confirm`, BSOD ack flags).

## Client (theapp)

Point theapp at the hub (already configured in `AppConstants.RailwayHubUrl`). On startup it:

1. Registers a stable device ID
2. Polls `/api/commands/poll` every 3 seconds
3. Executes commands locally and acks results

No hotspot required for remote control.

## Local dev

```bash
npm install
HELPY_API_KEY=devsecret npm run dev
```

Open `http://localhost:3000`, enter API key `devsecret`.

## Security note

Set `HELPY_API_KEY` on Railway. Without it, the admin API is open. Only install theapp on machines you own and control.
