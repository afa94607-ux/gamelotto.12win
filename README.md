# 1. Lottery12KH — Game Page & Shared Backend

- **Local URL**: `http://127.0.0.1:3001/`
- **Role**: Player Game Portal (Lottery #12) + Authoritative Shared Backend API & WebSocket Server.
- **Node.js Required**: Node.js `>= 20.0.0` (LTS 20 or 22 recommended).

## Quick Start in VS Code (Windows PowerShell)

1. Open this folder (`1-lottery12kh-game-page`) in VS Code.
2. Copy `.env.example` to `.env` (optional for local defaults).
3. Install dependencies once:
   ```powershell
   npm.cmd install
   ```
4. Start the Game Page + Shared Backend (ALWAYS start this BEFORE logging into the Admin Panel):
   ```powershell
   npm.cmd run dev
   ```
5. Open `http://127.0.0.1:3001/` in your browser.

*(In Git Bash / Command Prompt / macOS / Linux, use `npm install` and `npm run dev`.)*

## Verification & Automated Tests

```powershell
npm.cmd run lint    # TypeScript type-check
npm.cmd run build   # Production frontend build (dist/)
npm.cmd test        # Isolated E2E test suite (does NOT modify real user data)
```

## Port Conflict Troubleshooting (Port 3001)
If you see `Port 3001 is already in use`:
```powershell
Get-NetTCPConnection -LocalPort 3001 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```
