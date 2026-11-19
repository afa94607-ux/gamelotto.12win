# Lottery12KH — Cloudflare Free-Tier Deployment & Backend Architecture Guide

## 1. What CAN Run on Cloudflare Pages Free Tier Directly
Both frontends are standard Vite + React static builds (`npm run build` -> `dist/`) with `public/_redirects` for SPA routing:
- **Game Page Frontend** (`1-lottery12kh-game-page`): Build command `npm run build`, Output directory `dist`.
- **Admin Panel Frontend** (`2-lottery12kh-admin-panel`): Build command `npm run build`, Output directory `dist`.
- Set environment variables in Cloudflare Pages -> Settings -> Environment variables:
  - `VITE_API_BASE_URL` = `https://api.yourdomain.com` (your HTTPS backend URL — NEVER `http://127.0.0.1:3001`)
  - `VITE_WS_URL` = `wss://api.yourdomain.com/ws` (optional; derived automatically from `VITE_API_BASE_URL`)

## 2. Why the Current Node.js Backend CANNOT Run Unchanged on Cloudflare Pages/Workers
The shared backend in `1-lottery12kh-game-page/server.ts` currently uses:
1. **Express HTTP Server** (`express` + `http.createServer`) — Cloudflare Workers uses the Fetch API (`export default { fetch() }`), not Node's listening TCP server.
2. **Local Disk Filesystem Persistence** (`fs.readFileSync` / `fs.writeFileSync` to `data/lottery_server_state.json`) — Cloudflare Workers has **no persistent local filesystem**.
3. **Long-Lived WebSocket Hub** (`ws.WebSocketServer` keeping open sockets in process memory) — On Cloudflare Workers, WebSocket state & broadcasts require **Durable Objects** (which require a Workers Paid plan for production scale/higher limits; Free plan has strict daily request/CPU/storage limits).
4. **In-Process 200ms Authoritative Round Clock** (`setInterval`) — Serverless Workers are stateless and shut down between requests; scheduled draws require Durable Objects Alarms or a persistent Node.js host.

## 3. Honest Free-Tier Hosting Options for the Shared Backend
### Option A (Zero Backend Rewrite — Fastest & Safest):
- Host BOTH static frontends on **Cloudflare Pages (Free)**.
- Run `1-lottery12kh-game-page` backend (`server.ts`) on your own PC/VPS behind a **Cloudflare Tunnel (`cloudflared`)** (Free), OR on a Node.js host that supports persistent disk + WebSockets.
- Configure backend `.env`:
  ```env
  PORT=3001
  ALLOWED_ORIGINS="https://your-game-page.pages.dev,https://your-admin-panel.pages.dev"
  ```
- Over HTTPS, `server.ts` automatically sets `SameSite=None; Secure; HttpOnly` session cookies and reflects your exact `ALLOWED_ORIGINS` with `Access-Control-Allow-Credentials: true`.

### Option B (Full Cloudflare-Native Migration — Requires Explicit Approval & Backend Refactor):
- Migrate `data/lottery_server_state.json` -> **Cloudflare D1** (SQLite, Free tier: 5 GB storage, 5M reads/day, 100k writes/day).
- Migrate sessions -> **Cloudflare KV** or D1.
- Migrate real-time countdown/draw clock + WebSocket hub -> **Cloudflare Durable Objects** (Note: check current Cloudflare Free vs Paid Durable Objects pricing/limits before migrating!).

## 4. Safe Backup, Migration & Rollback Plan
1. **Backup Before Any Change**: Copy `1-lottery12kh-game-page/data/lottery_server_state.json` to a timestamped backup outside the repository (e.g., `backups/lottery_server_state_YYYYMMDD.json`).
2. **Never Commit Production State**: `.gitignore` excludes `data/*.json` and `.env`.
3. **Rollback**: Stop the backend, restore the previous `lottery_server_state.json` backup, and restart `npm.cmd run dev` (or `npm run start`).
