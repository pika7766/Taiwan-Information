# Taiwan Smart Life Portal

A Node.js map portal that combines Taiwan public information, weather, transport, safety data, OpenStreetMap search, and commonly used links.

## Local development

Requirements: Node.js 20 or later.

1. Copy `credentials-template.txt` to `.env` and enter your CWA and TDX credentials.
2. Run `npm start`.
3. Open `http://127.0.0.1:4174/`.

## Zeabur deployment

1. Push this directory to a GitHub repository. Do not commit `.env`.
2. In Zeabur, create a service from the GitHub repository.
3. Zeabur detects `package.json` and runs `npm start`. No custom build command is required.
4. Configure these variables in the Zeabur service:

| Variable | Required | Purpose |
| --- | --- | --- |
| `CWA_API_KEY` | Yes | Central Weather Administration data |
| `TDX_CLIENT_ID` | Yes | TDX API authentication |
| `TDX_CLIENT_SECRET` | Yes | TDX API authentication |
| `CWA_DATASET_IDS` | No | CWA fallback dataset IDs |
| `BUS_REALTIME_CACHE_FILE` | No | Persistent nationwide bus snapshot path, for example `/data/bus_realtime_cache.json` |

Zeabur provides `PORT` automatically. The server listens on `0.0.0.0`, and the frontend uses the deployed site's own origin for API calls.

The server maintains one shared nationwide TDX bus snapshot. It starts a refresh cycle every 15 seconds, retains the last successful data for cities that fail, and serves map clients from the snapshot. To keep the snapshot across restarts, mount a Zeabur Volume at `/data` and set `BUS_REALTIME_CACHE_FILE=/data/bus_realtime_cache.json`.

## Health check

`GET /api/status` returns service and credential configuration status without exposing credential values.

## Security

Only required frontend assets are publicly served. Files such as `.env`, `server.js`, logs, and credential templates are not available over HTTP.
