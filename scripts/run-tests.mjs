/**
 * Lottery12KH — Isolated Automated End-to-End Verification Suite
 *
 * Uses a temporary STATE_FILE_PATH in os.tmpdir() and an isolated TEST_PORT
 * so it NEVER touches or modifies your real data/lottery_server_state.json.
 *
 * Usage:
 *   npm test
 *   TEST_PORT=3198 npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = Number(process.env.TEST_PORT || 3199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lottery12kh_e2e_'));
const TMP_STATE_FILE = path.join(TMP_DIR, 'test_state.json');

const ADMIN_USER = process.env.TEST_ADMIN_USER || 'Afa';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || 'Aa112211';

function extractSetCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie();
  }
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function parseCookieHeader(setCookies) {
  return setCookies
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function api(pathname, options = {}) {
  const { method = 'GET', body, token, cookie, origin, headers = {} } = options;
  const reqHeaders = { ...headers };
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }
  if (cookie) {
    reqHeaders['Cookie'] = cookie;
  }
  if (origin) {
    reqHeaders['Origin'] = origin;
  }
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    setCookies: extractSetCookies(res),
    json,
  };
}

async function waitForHealth(timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Test server did not become healthy on ${BASE_URL} within ${timeoutMs}ms`);
}

function connectWs({ portalMode, playerToken, adminToken }) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const token = portalMode === 'admin' ? adminToken : playerToken;
    const qs = new URLSearchParams({ portal: portalMode });
    if (token) qs.set('token', token);
    const ws = new WebSocket(`${WS_URL}?${qs.toString()}`);
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      reject(new Error(`WS connect/init timeout for ${portalMode}`));
    }, 8000);

    let initResolved = false;

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'AUTH',
          portalMode,
          ...(playerToken ? { playerToken } : {}),
          ...(adminToken ? { adminToken } : {}),
        }),
      );
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        messages.push(msg);
        if (!initResolved && msg.type === 'INIT_STATE') {
          initResolved = true;
          clearTimeout(timer);
          resolve({ ws, messages, initPayload: msg.payload });
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on('error', (err) => {
      if (!initResolved) {
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function waitForWsEvent(messages, predicate, timeoutMs = 18000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for WebSocket event after ${timeoutMs}ms`);
}

async function main() {
  const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxCli)) {
    throw new Error(`tsx CLI not found at ${tsxCli}. Run npm install first.`);
  }

  const serverLogs = [];
  const child = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      DISABLE_MULTI_PORT: 'true',
      STATE_FILE_PATH: TMP_STATE_FILE,
      ALLOWED_ORIGINS: 'http://127.0.0.1:5174,https://admin.example.pages.dev',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d) => serverLogs.push(d.toString()));
  child.stderr?.on('data', (d) => serverLogs.push(d.toString()));

  const openSockets = [];

  try {
    await waitForHealth();
    let passed = 0;

    // ------------------------------------------------------------
    // TEST 1: Health, CORS, and Guest Zero-Leakage State
    // ------------------------------------------------------------
    {
      const health = await api('/api/health', { origin: 'http://127.0.0.1:5174' });
      assert.equal(health.status, 200, 'Health endpoint must return 200');
      assert.equal(health.json?.ok, true, 'Health payload must return ok: true');
      assert.equal(health.json?.forcedWinningNumber, undefined, 'Health must never leak forcedWinningNumber');
      assert.equal(
        health.headers.get('access-control-allow-origin'),
        'http://127.0.0.1:5174',
        'CORS must echo allowed origin',
      );
      assert.equal(
        health.headers.get('access-control-allow-credentials'),
        'true',
        'CORS must allow credentials',
      );

      const guestState = await api('/api/state');
      assert.equal(guestState.status, 200);
      assert.equal(guestState.json.balance, 0, 'Unauthenticated guest must see balance 0');
      assert.deepEqual(guestState.json.recentBets, [], 'Unauthenticated guest must see zero bets');
      assert.deepEqual(guestState.json.transactions, [], 'Unauthenticated guest must see zero transactions');
      assert.equal(guestState.json.playerBalances, undefined, 'Guest state must not expose playerBalances');
      assert.equal(guestState.json.forcedWinningNumber, null, 'Guest state must not expose forcedWinningNumber');

      const unauthBet = await api('/api/bet', {
        method: 'POST',
        body: {
          betRecord: {
            id: 'unauth-bet-1',
            roundId: `2004#${guestState.json.currentRoundIndex}`,
            time: '12:00:00',
            bets: [{ type: 'animal_1', label: '1. ជូត', amount: 1000, odds: 11 }],
            totalStake: 1000,
            totalPayout: 0,
            status: 'pending',
          },
        },
      });
      assert.equal(unauthBet.status, 401, 'Unauthenticated bet must be rejected with 401');

      passed += 1;
      console.log('  ✅ [1/5] Health, CORS, and guest zero-leakage verified');
    }

    // ------------------------------------------------------------
    // TEST 2: Admin Login, Session Cookie/Token, Player Creation & Admin-Only Deposits
    // ------------------------------------------------------------
    let adminToken = '';
    let adminCookie = '';
    let playerA = null;
    let playerB = null;
    {
      const badLogin = await api('/api/auth/admin/login', {
        method: 'POST',
        body: { username: ADMIN_USER, password: 'wrong-password-xyz' },
      });
      assert.equal(badLogin.status, 401, 'Invalid admin password must fail with 401');

      const login = await api('/api/auth/admin/login', {
        method: 'POST',
        origin: 'http://127.0.0.1:5174',
        body: { username: ADMIN_USER, password: ADMIN_PASS },
      });
      assert.equal(login.status, 200, `Admin login failed: ${JSON.stringify(login.json)}`);
      assert.ok(login.json?.token, 'Admin login must return bearer token');
      adminToken = login.json.token;
      adminCookie = parseCookieHeader(login.setCookies);
      assert.ok(adminCookie.includes('l12kh_admin_sid='), 'Admin login must set HttpOnly session cookie');

      const sessionViaCookie = await api('/api/auth/admin/session', { cookie: adminCookie });
      assert.equal(sessionViaCookie.status, 200, 'Admin session verification via cookie must succeed');
      assert.equal(sessionViaCookie.json?.authenticated, true);

      // Create two distinct players (A001 and A002)
      const createA = await api('/api/admin/players', {
        method: 'POST',
        token: adminToken,
        body: {
          username: 'E2E_A001',
          password: 'PassA001!',
          displayName: 'Test Player A001',
        },
      });
      assert.equal(createA.status, 201, `Create A001 failed: ${JSON.stringify(createA.json)}`);
      playerA = createA.json.player;
      assert.ok(playerA?.id, 'Player A must have an id');

      const createB = await api('/api/admin/players', {
        method: 'POST',
        token: adminToken,
        body: {
          username: 'E2E_A002',
          password: 'PassA002!',
          displayName: 'Test Player A002',
        },
      });
      assert.equal(createB.status, 201, `Create A002 failed: ${JSON.stringify(createB.json)}`);
      playerB = createB.json.player;
      assert.ok(playerB?.id, 'Player B must have an id');

      // Admin-only deposits via /api/transaction (with duplicate referenceId rejection)
      const depRefA = `E2E-DEP-A-${Date.now()}`;
      const depA = await api('/api/transaction', {
        method: 'POST',
        token: adminToken,
        body: {
          type: 'deposit',
          playerId: playerA.id,
          userName: playerA.username,
          amount: 75000,
          method: 'Admin Credit',
          status: 'approved',
          note: 'E2E admin credit A',
          referenceId: depRefA,
        },
      });
      assert.equal(depA.status, 200, `Admin deposit A failed: ${JSON.stringify(depA.json)}`);
      assert.equal(depA.json.newBalance, 75000, 'Player A balance must be 75000');

      const depDup = await api('/api/transaction', {
        method: 'POST',
        token: adminToken,
        body: {
          type: 'deposit',
          playerId: playerA.id,
          userName: playerA.username,
          amount: 75000,
          method: 'Admin Credit',
          status: 'approved',
          note: 'Duplicate attempt',
          referenceId: depRefA,
        },
      });
      assert.equal(depDup.status, 409, 'Duplicate referenceId admin deposit must be rejected with 409');

      const depB = await api('/api/transaction', {
        method: 'POST',
        token: adminToken,
        body: {
          type: 'deposit',
          playerId: playerB.id,
          userName: playerB.username,
          amount: 80000,
          method: 'Admin Credit',
          status: 'approved',
          note: 'E2E admin credit B',
          referenceId: `E2E-DEP-B-${Date.now()}`,
        },
      });
      assert.equal(depB.status, 200, `Admin deposit B failed: ${JSON.stringify(depB.json)}`);
      assert.equal(depB.json.newBalance, 80000, 'Player B balance must be 80000');

      // Verify 1/99 lottery routes remain disabled (410)
      const disabled199 = await api('/api/lottery199/bet', {
        method: 'POST',
        token: adminToken,
        body: { number: 12, amount: 1000 },
      });
      assert.equal(disabled199.status, 410, '1/99 route must be disabled with 410');

      passed += 1;
      console.log('  ✅ [2/5] Admin auth, player creation, idempotent admin deposits & 1/99 lock verified');
    }

    // ------------------------------------------------------------
    // TEST 3: Player Self-Deposit Blocked + Strict A001 vs A002 Isolation (HTTP & Live WS)
    // ------------------------------------------------------------
    let tokenA = '';
    let tokenB = '';
    let wsA = null;
    let wsB = null;
    let currentRoundId = '';
    {
      const loginA = await api('/api/auth/player/login', {
        method: 'POST',
        body: { username: 'E2E_A001', password: 'PassA001!' },
      });
      assert.equal(loginA.status, 200, `Player A login failed: ${JSON.stringify(loginA.json)}`);
      tokenA = loginA.json.token;

      const loginB = await api('/api/auth/player/login', {
        method: 'POST',
        body: { username: 'E2E_A002', password: 'PassA002!' },
      });
      assert.equal(loginB.status, 200, `Player B login failed: ${JSON.stringify(loginB.json)}`);
      tokenB = loginB.json.token;

      // Independent player self-deposit must be blocked on backend (403)
      const selfDep = await api('/api/transaction', {
        method: 'POST',
        token: tokenA,
        body: { type: 'deposit', amount: 10000, method: 'ABA' },
      });
      assert.equal(selfDep.status, 403, 'Player self-deposit must be blocked with 403');

      // Connect live WebSockets for BOTH players concurrently
      wsA = await connectWs({ portalMode: 'player', playerToken: tokenA });
      wsB = await connectWs({ portalMode: 'player', playerToken: tokenB });
      openSockets.push(wsA.ws, wsB.ws);

      assert.equal(wsA.initPayload.balance, 75000, 'WS INIT_STATE for A001 must show 75000');
      assert.equal(wsB.initPayload.balance, 80000, 'WS INIT_STATE for A002 must show 80000');
      currentRoundId = `2004#${wsA.initPayload.currentRoundIndex}`;

      // Place a bet as A001, attempting to spoof playerId = playerB.id (server MUST ignore spoofed playerId)
      const betA = await api('/api/bet', {
        method: 'POST',
        token: tokenA,
        body: {
          betRecord: {
            id: `bet-e2e-a-${Date.now()}`,
            roundId: currentRoundId,
            time: '12:00:01',
            bets: [{ type: 'animal_3', label: '3. ខាល', amount: 10000, odds: 11 }],
            totalStake: 10000,
            totalPayout: 0,
            status: 'pending',
            playerId: playerB.id,
            username: 'E2E_A002',
          },
        },
      });
      assert.equal(betA.status, 200, `Player A bet failed: ${JSON.stringify(betA.json)}`);
      assert.equal(betA.json.betRecord.playerId, playerA.id, 'Server must bind bet strictly to authenticated player A');
      assert.equal(betA.json.newBalance, 65000, 'Player A balance must drop from 75000 to 65000');

      // Place a different bet as A002 on animal_7
      const betB = await api('/api/bet', {
        method: 'POST',
        token: tokenB,
        body: {
          betRecord: {
            id: `bet-e2e-b-${Date.now()}`,
            roundId: currentRoundId,
            time: '12:00:02',
            bets: [{ type: 'animal_7', label: '7. មមី', amount: 5000, odds: 11 }],
            totalStake: 5000,
            totalPayout: 0,
            status: 'pending',
          },
        },
      });
      assert.equal(betB.status, 200, `Player B bet failed: ${JSON.stringify(betB.json)}`);
      assert.equal(betB.json.betRecord.playerId, playerB.id);
      assert.equal(betB.json.newBalance, 75000, 'Player B balance must drop from 80000 to 75000');

      // Allow WebSocket messages to arrive
      await new Promise((r) => setTimeout(r, 250));

      // Verify HTTP /api/state isolation
      const stateA = await api('/api/state', { token: tokenA });
      const stateB = await api('/api/state', { token: tokenB });
      assert.equal(stateA.json.balance, 65000);
      assert.equal(stateB.json.balance, 75000);
      assert.equal(stateA.json.recentBets.length, 1, 'Player A must see exactly 1 bet');
      assert.equal(stateB.json.recentBets.length, 1, 'Player B must see exactly 1 bet');
      assert.equal(stateA.json.recentBets[0].bets[0].type, 'animal_3', 'Player A must only see own bet animal_3');
      assert.equal(stateB.json.recentBets[0].bets[0].type, 'animal_7', 'Player B must only see own bet animal_7');
      assert.ok(
        stateA.json.recentBets.every((b) => b.playerId === playerA.id),
        'Player A state leaked another player bet!',
      );
      assert.ok(
        stateB.json.recentBets.every((b) => b.playerId === playerB.id),
        'Player B state leaked another player bet!',
      );

      // Verify /api/player/transactions isolation
      const txA = await api('/api/player/transactions', { token: tokenA });
      const txB = await api('/api/player/transactions', { token: tokenB });
      assert.equal(txA.status, 200);
      assert.equal(txB.status, 200);
      assert.ok(
        txA.json.transactions.every((t) => t.playerId === playerA.id),
        'Player A transactions leaked another player!',
      );
      assert.ok(
        txB.json.transactions.every((t) => t.playerId === playerB.id),
        'Player B transactions leaked another player!',
      );

      // Verify live WebSocket isolation (A001 never received A002's BET_PLACED and vice versa)
      const wsABets = wsA.messages.filter((m) => m.type === 'BET_PLACED');
      const wsBBets = wsB.messages.filter((m) => m.type === 'BET_PLACED');
      assert.ok(wsABets.length >= 1, 'Player A WS should receive own BET_PLACED');
      assert.ok(wsBBets.length >= 1, 'Player B WS should receive own BET_PLACED');
      assert.ok(
        wsABets.every((m) => m.betRecord?.playerId === playerA.id),
        'Player A WS received another player BET_PLACED event!',
      );
      assert.ok(
        wsBBets.every((m) => m.betRecord?.playerId === playerB.id),
        'Player B WS received another player BET_PLACED event!',
      );

      passed += 1;
      console.log('  ✅ [3/5] Strict A001 vs A002 isolation verified over HTTP, transactions & live WebSockets');
    }

    // ------------------------------------------------------------
    // TEST 4: Shared Official Draw + Scoped Settlement + System Owner Win/Loss Consistency
    // ------------------------------------------------------------
    {
      // Force draw with winning number = 3 (A001 wins 10,000 * 11 = 110,000; A002 loses 5,000)
      const drawRes = await api('/api/admin/force-draw', {
        method: 'POST',
        token: adminToken,
        body: { targetNumber: 3 },
      });
      assert.equal(drawRes.status, 200, `Force draw failed: ${JSON.stringify(drawRes.json)}`);

      // Wait for the 11-step reveal sequence to finish and deliver DRAW_FINISHED to both sockets
      const [drawWsA, drawWsB] = await Promise.all([
        waitForWsEvent(wsA.messages, (m) => m.type === 'DRAW_FINISHED' && m.outcomeResult?.roundId === currentRoundId, 18000),
        waitForWsEvent(wsB.messages, (m) => m.type === 'DRAW_FINISHED' && m.outcomeResult?.roundId === currentRoundId, 18000),
      ]);

      assert.equal(drawWsA.outcomeResult.number, 3, 'Player A must see official winning number 3');
      assert.equal(drawWsB.outcomeResult.number, 3, 'Player B must see official winning number 3');
      // A001: 65,000 + 110,000 = 175,000 | A002: 75,000 (unchanged on loss)
      assert.equal(drawWsA.newBalance, 175000, 'WS DRAW_FINISHED for A must report 175000');
      assert.equal(drawWsB.newBalance, 75000, 'WS DRAW_FINISHED for B must report 75000');
      assert.ok(drawWsA.recentBets.every((b) => b.playerId === playerA.id), 'WS DRAW_FINISHED leaked bets to A');
      assert.ok(drawWsB.recentBets.every((b) => b.playerId === playerB.id), 'WS DRAW_FINISHED leaked bets to B');

      // Verify HTTP state after settlement
      const stateA = await api('/api/state', { token: tokenA });
      const stateB = await api('/api/state', { token: tokenB });
      assert.equal(stateA.json.balance, 175000);
      assert.equal(stateB.json.balance, 75000);
      assert.equal(stateA.json.recentBets[0].status, 'won');
      assert.equal(stateB.json.recentBets[0].status, 'lost');

      // Verify unauthenticated request to /api/lottery12/win-loss is rejected with 401
      const unauthWinLoss = await api('/api/lottery12/win-loss');
      assert.equal(unauthWinLoss.status, 401, 'Unauthenticated /api/lottery12/win-loss must return 401');

      // Player-Specific Win/Loss Isolation:
      // A001 bet 10,000 on animal_3 and won 110,000 -> Owner Profit = 0, Owner Loss = 100,000, Owner Net P/L = -100,000
      // A002 bet 5,000 on animal_7 and lost 0       -> Owner Profit = 5,000, Owner Loss = 0, Owner Net P/L = +5,000
      const [playerAWinLoss, playerBWinLoss, spoofedA, dualSessionA] = await Promise.all([
        api('/api/lottery12/win-loss?period=all', { token: tokenA }),
        api('/api/lottery12/win-loss?period=all', { token: tokenB }),
        api(`/api/lottery12/win-loss?playerId=${encodeURIComponent(playerB.id)}`, { token: tokenA }),
        api('/api/lottery12/win-loss?period=all', { token: tokenA, cookie: adminCookie }),
      ]);
      assert.equal(playerAWinLoss.status, 200);
      assert.equal(playerBWinLoss.status, 200);
      assert.equal(spoofedA.status, 403, 'Cross-player query param must be rejected with 403');
      assert.equal(dualSessionA.status, 200);
      assert.ok(
        (playerAWinLoss.headers.get('cache-control') || '').includes('no-store'),
        'Win/Loss endpoint must set Cache-Control: no-store',
      );

      // Verify A001 sees ONLY A001's financial data (and NO byPlayer leak)
      assert.equal(playerAWinLoss.json.scope, 'player');
      assert.equal(playerAWinLoss.json.byPlayer, undefined, 'Player report must never expose byPlayer');
      assert.equal(playerAWinLoss.json.summary.totalValidBets, 1, 'A001 valid bets must be 1');
      assert.equal(playerAWinLoss.json.summary.totalValidStakes, 10000, 'A001 valid stakes must be 10000');
      assert.equal(playerAWinLoss.json.summary.totalPayouts, 110000, 'A001 payouts must be 110000');
      assert.equal(playerAWinLoss.json.summary.totalOwnerProfit, 0, 'A001 owner profit must be 0');
      assert.equal(playerAWinLoss.json.summary.totalOwnerLoss, 100000, 'A001 owner loss must be 100000');
      assert.equal(playerAWinLoss.json.summary.netOwnerProfitLoss, -100000, 'A001 owner net P/L must be -100000');

      // Verify dual-session (player token + admin cookie) STILL scopes strictly to player A001
      assert.equal(dualSessionA.json.scope, 'player');
      assert.equal(dualSessionA.json.summary.totalValidStakes, 10000, 'Dual-session request must stay scoped to A001');
      assert.equal(dualSessionA.json.summary.netOwnerProfitLoss, -100000);

      // Verify A002 sees ONLY A002's financial data
      assert.equal(playerBWinLoss.json.scope, 'player');
      assert.equal(playerBWinLoss.json.byPlayer, undefined);
      assert.equal(playerBWinLoss.json.summary.totalValidBets, 1, 'A002 valid bets must be 1');
      assert.equal(playerBWinLoss.json.summary.totalValidStakes, 5000, 'A002 valid stakes must be 5000');
      assert.equal(playerBWinLoss.json.summary.totalPayouts, 0, 'A002 payouts must be 0');
      assert.equal(playerBWinLoss.json.summary.totalOwnerProfit, 5000, 'A002 owner profit must be 5000');
      assert.equal(playerBWinLoss.json.summary.totalOwnerLoss, 0, 'A002 owner loss must be 0');
      assert.equal(playerBWinLoss.json.summary.netOwnerProfitLoss, 5000, 'A002 owner net P/L must be +5000');

      // Verify round-level totals reconcile with summary cards AND official round results remain shared
      const roundSumA = playerAWinLoss.json.byRound.reduce((acc, r) => acc + r.netPlatformWinLoss, 0);
      const roundSumB = playerBWinLoss.json.byRound.reduce((acc, r) => acc + r.netPlatformWinLoss, 0);
      assert.equal(roundSumA, playerAWinLoss.json.summary.netOwnerProfitLoss, 'A001 round totals must equal summary');
      assert.equal(roundSumB, playerBWinLoss.json.summary.netOwnerProfitLoss, 'A002 round totals must equal summary');

      const aRound = playerAWinLoss.json.byRound.find((r) => r.roundId === currentRoundId);
      const bRound = playerBWinLoss.json.byRound.find((r) => r.roundId === currentRoundId);
      assert.ok(aRound && bRound, 'Both players must see the shared official settled round');
      assert.equal(aRound.resultNumber, 3);
      assert.equal(bRound.resultNumber, 3);
      assert.equal(aRound.dateTime, bRound.dateTime, 'Official round timestamp must match across players');
      assert.equal(aRound.settledStakes, 10000);
      assert.equal(bRound.settledStakes, 5000);
      assert.equal(aRound.netPlatformWinLoss, -100000);
      assert.equal(bRound.netPlatformWinLoss, 5000);

      // Verify rounds where neither A001 nor A002 placed bets still appear with shared official outcome & 0 financials
      const otherSharedRoundA = playerAWinLoss.json.byRound.find((r) => r.roundId !== currentRoundId);
      const otherSharedRoundB = playerBWinLoss.json.byRound.find((r) => r.roundId !== currentRoundId);
      if (otherSharedRoundA && otherSharedRoundB) {
        assert.equal(otherSharedRoundA.roundId, otherSharedRoundB.roundId);
        assert.equal(otherSharedRoundA.resultNumber, otherSharedRoundB.resultNumber);
        assert.equal(otherSharedRoundA.settledStakes, 0);
        assert.equal(otherSharedRoundB.settledStakes, 0);
      }

      // System Owner Win/Loss consistency across all 3 Admin system-wide endpoints:
      // For this round across ALL players: stakes = 15,000, payouts = 110,000, owner net = -95,000
      const [winLossEndpoint, ownerEndpoint, overviewEndpoint] = await Promise.all([
        api(`/api/lottery12/win-loss?roundId=${encodeURIComponent(currentRoundId)}`, { token: adminToken }),
        api(`/api/admin/owner-win-loss?roundId=${encodeURIComponent(currentRoundId)}`, { token: adminToken }),
        api('/api/admin/overview', { token: adminToken }),
      ]);
      assert.equal(winLossEndpoint.status, 200);
      assert.equal(ownerEndpoint.status, 200);
      assert.equal(overviewEndpoint.status, 200);

      assert.equal(winLossEndpoint.json.scope, 'system');
      assert.equal(winLossEndpoint.json.summary.totalValidBets, 2);
      assert.equal(winLossEndpoint.json.summary.totalValidStakes, 15000);
      assert.equal(winLossEndpoint.json.summary.totalPayouts, 110000);
      assert.equal(winLossEndpoint.json.summary.totalOwnerProfit, 5000);
      assert.equal(winLossEndpoint.json.summary.totalOwnerLoss, 100000);
      assert.equal(winLossEndpoint.json.summary.netOwnerProfitLoss, -95000);
      assert.equal(ownerEndpoint.json.summary.netOwnerProfitLoss, -95000);

      const overviewRound = overviewEndpoint.json.ownerLottery12Report.byRound.find(
        (r) => r.roundId === currentRoundId,
      );
      assert.ok(overviewRound, 'Overview report must contain settled round');
      assert.equal(overviewRound.netPlatformWinLoss, -95000, 'Overview round netPlatformWinLoss must match -95000');

      passed += 1;
      console.log('  ✅ [4/5] Individual A001/A002 Win/Loss isolation, shared rounds & Admin system-wide totals verified');
    }

    // ------------------------------------------------------------
    // TEST 5: Logout Revocation (Admin & Player) & Post-Logout Report Protection
    // ------------------------------------------------------------
    {
      const adminOut = await api('/api/auth/admin/logout', { method: 'POST', token: adminToken });
      assert.equal(adminOut.status, 200);
      const afterAdminOut = await api('/api/auth/admin/session', { token: adminToken });
      assert.equal(afterAdminOut.status, 401, 'Revoked admin token must fail with 401');

      const playerOut = await api('/api/auth/player/logout', { method: 'POST', token: tokenA });
      assert.equal(playerOut.status, 200);
      const afterPlayerOut = await api('/api/auth/player/session', { token: tokenA });
      assert.equal(afterPlayerOut.status, 401, 'Revoked player token must fail with 401');
      const afterPlayerReport = await api('/api/lottery12/win-loss', { token: tokenA });
      assert.equal(afterPlayerReport.status, 401, 'Logged-out A001 token must be rejected from win-loss report');

      // Player B session remains unaffected and strictly sees only B's report
      const bStillOk = await api('/api/lottery12/win-loss', { token: tokenB });
      assert.equal(bStillOk.status, 200);
      assert.equal(bStillOk.json.summary.totalValidStakes, 5000);
      assert.equal(bStillOk.json.summary.netOwnerProfitLoss, 5000);

      passed += 1;
      console.log('  ✅ [5/5] Admin & Player session logout revocation & post-logout report protection verified');
    }

    console.log(`\n🎉 ALL ${passed}/5 ISOLATED E2E TESTS PASSED!`);
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err);
    if (serverLogs.length > 0) {
      console.error('\n--- Server Logs ---\n' + serverLogs.slice(-30).join(''));
    }
    process.exitCode = 1;
  } finally {
    for (const sock of openSockets) {
      try {
        sock.terminate();
      } catch {
        // ignore
      }
    }
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 300));
    try {
      if (!child.killed) child.kill('SIGKILL');
    } catch {
      // ignore
    }
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
    process.exit(process.exitCode || 0);
  }
}

main();
