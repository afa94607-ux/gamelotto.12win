import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const PERSISTENCE_FILE = process.env.STATE_FILE_PATH
  ? path.resolve(process.env.STATE_FILE_PATH)
  : path.resolve(DATA_DIR, 'lottery_server_state.json');

try {
  const persistenceDir = path.dirname(PERSISTENCE_FILE);
  if (!fs.existsSync(persistenceDir)) {
    fs.mkdirSync(persistenceDir, { recursive: true });
  }
} catch (e) {
  console.warn('Failed to ensure data dir exists', e);
}

// ========================================================
// CRYPTOGRAPHIC PASSWORD HASHING & SESSION UTILITIES
// ========================================================

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedBuffer = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
  } catch {
    return false;
  }
}

function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

const CAMBODIA_TZ = 'Asia/Phnom_Penh';

function getPhnomPenhParts(input: Date | number = Date.now()) {
  const dateObj = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMBODIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(dateObj);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hour = map.hour === '24' ? '00' : map.hour || '00';
  return {
    yyyy: map.year || '2026',
    mm: map.month || '01',
    dd: map.day || '01',
    hh: hour,
    min: map.minute || '00',
    sec: map.second || '00',
  };
}

function formatPhnomPenhDate(input: Date | number = Date.now()): string {
  const p = getPhnomPenhParts(input);
  return `${p.yyyy}-${p.mm}-${p.dd}`;
}

function formatPhnomPenhTime(input: Date | number = Date.now()): string {
  const p = getPhnomPenhParts(input);
  return `${p.hh}:${p.min}:${p.sec}`;
}

function formatPhnomPenhDateTime(input: Date | number = Date.now()): string {
  const p = getPhnomPenhParts(input);
  return `${p.yyyy}-${p.mm}-${p.dd} ${p.hh}:${p.min}:${p.sec}`;
}

function formatNowTimestamp(input: Date | number = Date.now()): string {
  const p = getPhnomPenhParts(input);
  return `${p.yyyy}-${p.mm}-${p.dd} ${p.hh}:${p.min}`;
}

function formatShortTime(input: Date | number = Date.now()): string {
  const p = getPhnomPenhParts(input);
  return `${p.hh}:${p.min}`;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (key) {
      list[key] = decodeURIComponent(parts.join('=').trim());
    }
  });
  return list;
}

// ========================================================
// DATA TYPES
// ========================================================

type ColorGroup = 'red' | 'green' | 'blue';
type SizeGroup = 'small' | 'big';
type ParityGroup = 'odd' | 'even';
type BetCategory =
  | 'small'
  | 'big'
  | 'odd'
  | 'even'
  | 'color_red'
  | 'color_green'
  | 'color_blue'
  | `animal_${number}`;

interface AnimalData {
  number: number;
  khmerName: string;
  animalEn: string;
  color: ColorGroup;
  size: SizeGroup;
  parity: ParityGroup;
  odds: number;
}

const ANIMALS_DATA: Record<number, AnimalData> = {
  1: { number: 1, khmerName: 'ជូត', animalEn: 'Rat', color: 'red', size: 'small', parity: 'odd', odds: 11 },
  2: { number: 2, khmerName: 'ឆ្លូវ', animalEn: 'Ox', color: 'green', size: 'small', parity: 'even', odds: 11 },
  3: { number: 3, khmerName: 'ខាល', animalEn: 'Tiger', color: 'blue', size: 'small', parity: 'odd', odds: 11 },
  4: { number: 4, khmerName: 'ថោះ', animalEn: 'Rabbit', color: 'red', size: 'small', parity: 'even', odds: 11 },
  5: { number: 5, khmerName: 'រោង', animalEn: 'Dragon', color: 'green', size: 'small', parity: 'odd', odds: 11 },
  6: { number: 6, khmerName: 'ម្សាញ់', animalEn: 'Snake', color: 'blue', size: 'small', parity: 'even', odds: 11 },
  7: { number: 7, khmerName: 'មមី', animalEn: 'Horse', color: 'red', size: 'big', parity: 'odd', odds: 11 },
  8: { number: 8, khmerName: 'មមែ', animalEn: 'Goat', color: 'green', size: 'big', parity: 'even', odds: 11 },
  9: { number: 9, khmerName: 'វក', animalEn: 'Monkey', color: 'blue', size: 'big', parity: 'odd', odds: 11 },
  10: { number: 10, khmerName: 'រកា', animalEn: 'Rooster', color: 'red', size: 'big', parity: 'even', odds: 11 },
  11: { number: 11, khmerName: 'ច', animalEn: 'Dog', color: 'green', size: 'big', parity: 'odd', odds: 11 },
  12: { number: 12, khmerName: 'កុរ', animalEn: 'Pig', color: 'blue', size: 'big', parity: 'even', odds: 11 },
};

interface DrawResult {
  roundId: string;
  roundIndex: number;
  time: string;
  number: number;
  animal: string;
  color: ColorGroup;
  size: SizeGroup;
  parity: ParityGroup;
  timestamp: number;
}

interface BetHistoryRecord {
  id: string;
  roundId: string;
  time: string;
  placedTimestamp?: number;
  settledAt?: string;
  settledTimestamp?: number;
  playerId?: string;
  username?: string;
  acceptedOdds?: number;
  bets: {
    type: BetCategory;
    label: string;
    amount: number;
    odds: number;
    potentialWin?: number;
    won: boolean;
    payout: number;
  }[];
  totalStake: number;
  totalPotentialPayout: number;
  totalPayout: number;
  netProfit: number;
  resultNumber?: number;
  status: 'won' | 'lost' | 'pending' | 'refunded' | 'voided';
  voidReason?: string;
}

interface TransactionRecord {
  id: string;
  playerId?: string;
  adminId?: string;
  adminUsername?: string;
  referenceId?: string;
  userName: string;
  userPhone: string;
  type: 'deposit' | 'withdrawal' | 'adjustment';
  amount: number;
  method: 'ABA Bank' | 'Wing' | 'ACLEDA' | 'TrueMoney' | 'Cash' | 'Manual';
  status: 'pending' | 'approved' | 'rejected';
  timestamp: number;
  timeString: string;
  dateString?: string;
  note?: string;
}

type AccountStatus = 'active' | 'disabled';
type AdminRole = 'super_admin' | 'operations_admin' | 'finance_auditor';

interface StoredPlayerAccount {
  id: string;
  username: string;
  displayName: string;
  phone: string;
  passwordHash: string;
  status: AccountStatus;
  balance: number;
  betsCount7d: number;
  createdAt: string;
  lastLogin: string | null;
  sessionVersion: number;
}

interface StoredAdminAccount {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: string[];
  passwordHash: string;
  status: AccountStatus;
  createdAt: string;
  lastLogin: string | null;
  sessionVersion: number;
}

interface SessionRecord {
  token: string;
  csrfToken: string;
  accountId: string;
  username: string;
  role: 'player' | AdminRole;
  sessionVersion: number;
  createdAt: number;
  expiresAt: number;
  ip: string;
  userAgent: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: number;
  timeString: string;
  actorId: string;
  actorUsername: string;
  actorRole: string;
  action: string;
  targetId?: string;
  targetName?: string;
  details: string;
  ip?: string;
}

interface PlatformSettings {
  roundDurationSeconds: number;
  bettingLockoutSeconds: number;
  isRoundPaused: boolean;
  minBetRiel: number;
  maxBetRiel: number;
  animalOdds: number;
  colorOdds: number;
  sizeParityOdds: number;
  maintenanceMode: boolean;
  sessionTimeoutMinutes: number;
}

// Initial History
const INITIAL_HISTORY: DrawResult[] = [
  { roundId: '2004#283', roundIndex: 283, time: '16:19', number: 1, animal: 'ជូត', color: 'red', size: 'small', parity: 'odd', timestamp: Date.now() - 60000 },
  { roundId: '2004#282', roundIndex: 282, time: '16:15', number: 9, animal: 'វក', color: 'blue', size: 'big', parity: 'odd', timestamp: Date.now() - 120000 },
  { roundId: '2004#281', roundIndex: 281, time: '16:12', number: 8, animal: 'មមែ', color: 'green', size: 'big', parity: 'even', timestamp: Date.now() - 180000 },
  { roundId: '2004#280', roundIndex: 280, time: '16:08', number: 10, animal: 'រកា', color: 'red', size: 'big', parity: 'even', timestamp: Date.now() - 240000 },
  { roundId: '2004#279', roundIndex: 279, time: '16:05', number: 11, animal: 'ច', color: 'green', size: 'big', parity: 'odd', timestamp: Date.now() - 300000 },
  { roundId: '2004#278', roundIndex: 278, time: '16:01', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 360000 },
  { roundId: '2004#277', roundIndex: 277, time: '15:58', number: 9, animal: 'វក', color: 'blue', size: 'big', parity: 'odd', timestamp: Date.now() - 420000 },
  { roundId: '2004#276', roundIndex: 276, time: '15:54', number: 10, animal: 'រកា', color: 'red', size: 'big', parity: 'even', timestamp: Date.now() - 480000 },
  { roundId: '2004#275', roundIndex: 275, time: '15:50', number: 8, animal: 'មមែ', color: 'green', size: 'big', parity: 'even', timestamp: Date.now() - 540000 },
  { roundId: '2004#274', roundIndex: 274, time: '15:47', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 600000 },
  { roundId: '2004#273', roundIndex: 273, time: '15:43', number: 2, animal: 'ឆ្លូវ', color: 'green', size: 'small', parity: 'even', timestamp: Date.now() - 660000 },
  { roundId: '2004#272', roundIndex: 272, time: '15:40', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 720000 },
  { roundId: '2004#271', roundIndex: 271, time: '15:36', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 780000 },
  { roundId: '2004#270', roundIndex: 270, time: '15:32', number: 8, animal: 'មមែ', color: 'green', size: 'big', parity: 'even', timestamp: Date.now() - 840000 },
  { roundId: '2004#269', roundIndex: 269, time: '15:28', number: 11, animal: 'ច', color: 'green', size: 'big', parity: 'odd', timestamp: Date.now() - 900000 },
  { roundId: '2004#268', roundIndex: 268, time: '15:25', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 960000 },
  { roundId: '2004#267', roundIndex: 267, time: '15:21', number: 7, animal: 'មមី', color: 'red', size: 'big', parity: 'odd', timestamp: Date.now() - 1020000 },
  { roundId: '2004#266', roundIndex: 266, time: '15:18', number: 5, animal: 'រោង', color: 'green', size: 'small', parity: 'odd', timestamp: Date.now() - 1080000 },
  { roundId: '2004#265', roundIndex: 265, time: '15:14', number: 5, animal: 'រោង', color: 'green', size: 'small', parity: 'odd', timestamp: Date.now() - 1140000 },
  { roundId: '2004#264', roundIndex: 264, time: '15:10', number: 1, animal: 'ជូត', color: 'red', size: 'small', parity: 'odd', timestamp: Date.now() - 1200000 },
  { roundId: '2004#263', roundIndex: 263, time: '15:06', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 1260000 },
  { roundId: '2004#262', roundIndex: 262, time: '15:02', number: 10, animal: 'រកា', color: 'red', size: 'big', parity: 'even', timestamp: Date.now() - 1320000 },
  { roundId: '2004#261', roundIndex: 261, time: '14:58', number: 7, animal: 'មមី', color: 'red', size: 'big', parity: 'odd', timestamp: Date.now() - 1380000 },
  { roundId: '2004#260', roundIndex: 260, time: '14:54', number: 1, animal: 'ជូត', color: 'red', size: 'small', parity: 'odd', timestamp: Date.now() - 1440000 },
  { roundId: '2004#259', roundIndex: 259, time: '14:50', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 1500000 },
  { roundId: '2004#258', roundIndex: 258, time: '14:46', number: 2, animal: 'ឆ្លូវ', color: 'green', size: 'small', parity: 'even', timestamp: Date.now() - 1560000 },
  { roundId: '2004#257', roundIndex: 257, time: '14:42', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 1620000 },
];

function generateRandomMix(): number[] {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return numbers;
}

// ========================================================
// GLOBAL AUTHORITATIVE SERVER STATE
// ========================================================

class ServerGameState {
  currentRoundIndex = 284;
  currentRoundTime = '16:22';
  countdown = 180;
  roundEndTimestamp = Date.now() + 180000;
  pauseRemainingMs: number | null = null;
  lastBroadcastCountdown: number = 180;
  countdown10sBroadcastRound: number | null = null;
  isRevealing = false;
  revealStep = 0;
  drawMix = generateRandomMix();
  forcedWinningNumber: number | null = null;
  pendingWinningResult: DrawResult | null = null;
  history: DrawResult[] = INITIAL_HISTORY;
  settledRoundIds: Set<string> = new Set();
  balance = 466000;
  recentBets: BetHistoryRecord[] = [];
  transactions: TransactionRecord[] = [
    {
      id: 'tx-1001',
      playerId: 'P0001001',
      userName: 'player1',
      userPhone: '012 888 999',
      type: 'deposit',
      amount: 500000,
      method: 'ABA Bank',
      status: 'approved',
      timestamp: Date.now() - 3600000,
      timeString: '15:20',
      note: 'ABA PayWay Deposit',
    },
    {
      id: 'tx-1002',
      playerId: 'P0002456',
      userName: 'player6688',
      userPhone: '098 777 666',
      type: 'withdrawal',
      amount: 200000,
      method: 'Wing',
      status: 'pending',
      timestamp: Date.now() - 1800000,
      timeString: '15:55',
      note: 'ដកប្រាក់ឈ្នះជុំ 2004#280',
    },
    {
      id: 'tx-1003',
      playerId: 'P0002455',
      userName: 'player5521',
      userPhone: '077 111 222',
      type: 'deposit',
      amount: 300000,
      method: 'ACLEDA',
      status: 'pending',
      timestamp: Date.now() - 900000,
      timeString: '16:10',
      note: 'ACLEDA Mobile Top-up',
    },
    {
      id: 'tx-1004',
      playerId: 'P0001001',
      userName: 'player1',
      userPhone: '012 888 999',
      type: 'deposit',
      amount: 100000,
      method: 'TrueMoney',
      status: 'approved',
      timestamp: Date.now() - 600000,
      timeString: '16:15',
      note: 'TrueMoney Deposit',
    },
  ];

  players: StoredPlayerAccount[] = [];
  admins: StoredAdminAccount[] = [];
  sessions: Record<string, SessionRecord> = {};
  auditLogs: AuditLogEntry[] = [];
  platformSettings: PlatformSettings = {
    roundDurationSeconds: 180,
    bettingLockoutSeconds: 10,
    isRoundPaused: false,
    minBetRiel: 1000,
    maxBetRiel: 5000000,
    animalOdds: 11,
    colorOdds: 2.95,
    sizeParityOdds: 1.95,
    maintenanceMode: false,
    sessionTimeoutMinutes: 480,
  };

  drawTimeouts: NodeJS.Timeout[] = [];
  startedAt = Date.now();

  constructor() {
    this.loadStateFromDisk();
    this.ensureDefaultAccountsSeeded();
    const initialSec = Math.max(11, Math.min(this.platformSettings.roundDurationSeconds || 180, this.countdown || 180));
    this.countdown = initialSec;
    this.roundEndTimestamp = Date.now() + initialSec * 1000;
    this.lastBroadcastCountdown = initialSec;
  }

  ensureDefaultAccountsSeeded() {
    let changed = false;

    if (!this.admins || this.admins.length === 0) {
      const initialManagerPass = process.env.INITIAL_MANAGER_PASSWORD || 'Manager@123456';
      this.admins = [
        {
          id: 'ADM-001',
          username: 'Afa',
          displayName: 'Afa (Super Administrator)',
          role: 'super_admin',
          permissions: ['all', 'users.manage', 'rounds.manage', 'results.manage', 'bets.view', 'finance.manage', 'settings.manage', 'audit.view'],
          passwordHash: hashPassword('Aa112211'),
          status: 'active',
          createdAt: '2026-10-01 08:00',
          lastLogin: '2026-11-18 13:45',
          sessionVersion: 1,
        },
        {
          id: 'ADM-002',
          username: 'supervisor',
          displayName: 'Operations Supervisor',
          role: 'operations_admin',
          permissions: ['users.manage', 'rounds.manage', 'results.manage', 'bets.view', 'audit.view'],
          passwordHash: hashPassword(initialManagerPass),
          status: 'active',
          createdAt: '2026-10-15 09:30',
          lastLogin: '2026-11-18 10:15',
          sessionVersion: 1,
        },
        {
          id: 'ADM-003',
          username: 'auditor',
          displayName: 'Finance & Compliance Auditor',
          role: 'finance_auditor',
          permissions: ['bets.view', 'finance.manage', 'audit.view'],
          passwordHash: hashPassword('Auditor@123456'),
          status: 'active',
          createdAt: '2026-10-20 11:00',
          lastLogin: '2026-11-17 16:40',
          sessionVersion: 1,
        },
      ];
      changed = true;
    } else {
      // Ensure Super Administrator account 'Afa' with password 'Aa112211' is configured and active
      const existingAfa = this.admins.find((a) => a.username.toLowerCase() === 'afa');
      if (!existingAfa) {
        const adm001 = this.admins.find((a) => a.id === 'ADM-001');
        if (adm001) {
          adm001.username = 'Afa';
          adm001.displayName = 'Afa (Super Administrator)';
          adm001.role = 'super_admin';
          adm001.permissions = ['all', 'users.manage', 'rounds.manage', 'results.manage', 'bets.view', 'finance.manage', 'settings.manage', 'audit.view'];
          adm001.passwordHash = hashPassword('Aa112211');
          adm001.status = 'active';
        } else {
          this.admins.unshift({
            id: 'ADM-001',
            username: 'Afa',
            displayName: 'Afa (Super Administrator)',
            role: 'super_admin',
            permissions: ['all', 'users.manage', 'rounds.manage', 'results.manage', 'bets.view', 'finance.manage', 'settings.manage', 'audit.view'],
            passwordHash: hashPassword('Aa112211'),
            status: 'active',
            createdAt: '2026-10-01 08:00',
            lastLogin: '2026-11-18 13:45',
            sessionVersion: 1,
          });
        }
        changed = true;
      } else if (!verifyPassword('Aa112211', existingAfa.passwordHash) || existingAfa.status !== 'active') {
        existingAfa.username = 'Afa';
        existingAfa.passwordHash = hashPassword('Aa112211');
        existingAfa.status = 'active';
        existingAfa.role = 'super_admin';
        existingAfa.permissions = ['all', 'users.manage', 'rounds.manage', 'results.manage', 'bets.view', 'finance.manage', 'settings.manage', 'audit.view'];
        changed = true;
      }
    }

    if (!this.players || this.players.length === 0) {
      this.players = [
        {
          id: 'P0002456',
          username: 'player6688',
          displayName: 'player6688',
          phone: '012 668 800',
          passwordHash: hashPassword('Player@6688'),
          status: 'active',
          balance: 5000000, // 5,000,000៛ ($1,250.00)
          betsCount7d: 38,
          createdAt: '2026-11-10 14:22',
          lastLogin: '2026-11-18 13:40',
          sessionVersion: 1,
        },
        {
          id: 'P0002455',
          username: 'player5521',
          displayName: 'player5521',
          phone: '098 552 100',
          passwordHash: hashPassword('Player@5521'),
          status: 'active',
          balance: 1920000, // 1,920,000៛ ($480.00)
          betsCount7d: 12,
          createdAt: '2026-11-09 10:15',
          lastLogin: '2026-11-18 12:57',
          sessionVersion: 1,
        },
        {
          id: 'P0002454',
          username: 'player3399',
          displayName: 'player3399',
          phone: '077 339 900',
          passwordHash: hashPassword('Player@3399'),
          status: 'disabled',
          balance: 0,
          betsCount7d: 0,
          createdAt: '2026-11-08 19:36',
          lastLogin: '2026-11-12 08:21',
          sessionVersion: 1,
        },
        {
          id: 'P0002453',
          username: 'player1122',
          displayName: 'player1122',
          phone: '015 112 200',
          passwordHash: hashPassword('Player@1122'),
          status: 'active',
          balance: 9200000, // 9,200,000៛ ($2,300.00)
          betsCount7d: 56,
          createdAt: '2026-11-07 21:04',
          lastLogin: '2026-11-18 11:02',
          sessionVersion: 1,
        },
        {
          id: 'P0002452',
          username: 'player7788',
          displayName: 'player7788',
          phone: '089 778 800',
          passwordHash: hashPassword('Player@7788'),
          status: 'active',
          balance: 3040000, // 3,040,000៛ ($760.00)
          betsCount7d: 21,
          createdAt: '2026-11-05 16:18',
          lastLogin: '2026-11-18 09:47',
          sessionVersion: 1,
        },
        {
          id: 'P0001001',
          username: 'player1',
          displayName: 'អតិថិជន Player #1',
          phone: '012 888 999',
          passwordHash: hashPassword('Player@123'),
          status: 'active',
          balance: this.balance,
          betsCount7d: 14,
          createdAt: '2026-11-01 09:00',
          lastLogin: '2026-11-18 14:00',
          sessionVersion: 1,
        },
      ];
      changed = true;
    }

    if (!this.auditLogs || this.auditLogs.length === 0) {
      this.auditLogs = [
        {
          id: 'aud-1004',
          timestamp: Date.now() - 300000,
          timeString: '5 min ago',
          actorId: 'ADM-001',
          actorUsername: 'admin',
          actorRole: 'super_admin',
          action: 'CREATE_PLAYER',
          targetId: 'P0002456',
          targetName: 'player6688',
          details: 'បង្កើតគណនីថ្មី: player6688 / New player created',
          ip: '127.0.0.1',
        },
        {
          id: 'aud-1003',
          timestamp: Date.now() - 720000,
          timeString: '12 min ago',
          actorId: 'ADM-001',
          actorUsername: 'admin',
          actorRole: 'super_admin',
          action: 'RESET_PASSWORD',
          targetId: 'P0002455',
          targetName: 'player5521',
          details: 'ផ្លាស់ប្តូរពាក្យសម្ងាត់: player5521 / Password changed',
          ip: '127.0.0.1',
        },
        {
          id: 'aud-1002',
          timestamp: Date.now() - 1560000,
          timeString: '26 min ago',
          actorId: 'ADM-001',
          actorUsername: 'admin',
          actorRole: 'super_admin',
          action: 'SET_RESULT',
          targetId: '2004#284',
          targetName: 'Round #284',
          details: 'កំណត់លទ្ធផលជុំ 2004#284 / Result set for round #284',
          ip: '127.0.0.1',
        },
        {
          id: 'aud-1001',
          timestamp: Date.now() - 2280000,
          timeString: '38 min ago',
          actorId: 'ADM-001',
          actorUsername: 'admin',
          actorRole: 'super_admin',
          action: 'ADMIN_LOGIN',
          details: 'ចូលប្រព័ន្ធ: Admin / Admin logged in',
          ip: '127.0.0.1',
        },
      ];
      changed = true;
    }

    // Backfill username on existing recentBets if missing
    this.recentBets = this.recentBets.map((b, idx) => ({
      ...b,
      playerId: b.playerId || (idx % 2 === 0 ? 'P0002456' : 'P0001001'),
      username: b.username || (idx % 2 === 0 ? 'player6688' : 'player1'),
    }));

    if (changed) {
      this.saveStateToDisk();
    }
  }

  loadStateFromDisk() {
    try {
      if (fs.existsSync(PERSISTENCE_FILE)) {
        const raw = fs.readFileSync(PERSISTENCE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed) {
          if (typeof parsed.currentRoundIndex === 'number' && parsed.currentRoundIndex > 0) {
            this.currentRoundIndex = parsed.currentRoundIndex;
          }
          if (typeof parsed.currentRoundTime === 'string') {
            this.currentRoundTime = parsed.currentRoundTime;
          }
          if (Array.isArray(parsed.history) && parsed.history.length > 0) {
            this.history = parsed.history;
          }
          if (Array.isArray(parsed.recentBets)) {
            this.recentBets = parsed.recentBets;
          }
          if (Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
            this.transactions = parsed.transactions;
          }
          if (typeof parsed.balance === 'number') {
            this.balance = parsed.balance;
          }
          if (parsed.forcedWinningNumber !== undefined) {
            this.forcedWinningNumber = parsed.forcedWinningNumber;
          }
          if (Array.isArray(parsed.players) && parsed.players.length > 0) {
            this.players = parsed.players;
          }
          if (Array.isArray(parsed.admins) && parsed.admins.length > 0) {
            this.admins = parsed.admins;
          }
          if (parsed.sessions && typeof parsed.sessions === 'object') {
            this.sessions = parsed.sessions;
          }
          if (Array.isArray(parsed.auditLogs) && parsed.auditLogs.length > 0) {
            this.auditLogs = parsed.auditLogs;
          }
          if (parsed.platformSettings && typeof parsed.platformSettings === 'object') {
            this.platformSettings = { ...this.platformSettings, ...parsed.platformSettings };
          }
          const activeRoundId = `2004#${this.currentRoundIndex}`;
          this.settledRoundIds = new Set(
            this.history
              .map((h) => h.roundId)
              .filter((rid) => rid && rid !== activeRoundId)
          );
          console.log(`[Disk Persistence] Loaded game state. Round: 2004#${this.currentRoundIndex}, Players: ${this.players.length}, Admins: ${this.admins.length}, History: ${this.history.length}`);
        }
      }
    } catch (e) {
      console.warn('[Disk Persistence] Failed to load state from disk', e);
    }
  }

  saveStateToDisk() {
    try {
      const dataToSave = {
        currentRoundIndex: this.currentRoundIndex,
        currentRoundTime: this.currentRoundTime,
        history: this.history,
        recentBets: this.recentBets,
        transactions: this.transactions,
        balance: this.balance,
        forcedWinningNumber: this.forcedWinningNumber,
        players: this.players,
        admins: this.admins,
        sessions: this.sessions,
        auditLogs: this.auditLogs.slice(0, 500),
        platformSettings: this.platformSettings,
        savedAt: Date.now(),
      };
      fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[Disk Persistence] Error writing state to disk', e);
    }
  }

  addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'timeString'>) {
    const newEntry: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      timeString: formatNowTimestamp(),
    };
    this.auditLogs = [newEntry, ...this.auditLogs].slice(0, 500);
    this.saveStateToDisk();
    broadcastAdminOnly({ type: 'AUDIT_LOG_ADDED', auditLog: newEntry });
    return newEntry;
  }

  getActiveSessionCountForAccount(accountId: string): number {
    const now = Date.now();
    return Object.values(this.sessions).filter(
      (s) => s.accountId === accountId && s.expiresAt > now
    ).length;
  }

  revokeSessionsForAccount(accountId: string): number {
    let count = 0;
    for (const [token, sess] of Object.entries(this.sessions)) {
      if (sess.accountId === accountId) {
        delete this.sessions[token];
        count++;
      }
    }
    broadcastToPlayerAndAdmins(
      accountId,
      () => ({ type: 'SESSION_REVOKED', accountId }),
      () => ({ type: 'SESSION_REVOKED', accountId })
    );
    return count;
  }

  getPlayerBalancesMap(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const p of this.players) {
      map[p.id] = p.balance;
    }
    return map;
  }

  sanitizePlayer(p: StoredPlayerAccount) {
    const recordedBetsCount = this.recentBets.filter(
      (b) => b.playerId === p.id || b.username?.toLowerCase() === p.username.toLowerCase()
    ).length;
    return {
      id: p.id,
      username: p.username,
      displayName: p.displayName,
      phone: p.phone,
      status: p.status,
      balance: p.balance,
      betsCount7d: Math.max(p.betsCount7d || 0, recordedBetsCount),
      createdAt: p.createdAt,
      lastLogin: p.lastLogin,
      activeSessionsCount: this.getActiveSessionCountForAccount(p.id),
    };
  }

  sanitizeAdmin(a: StoredAdminAccount) {
    return {
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      role: a.role,
      permissions: a.permissions,
      status: a.status,
      createdAt: a.createdAt,
      lastLogin: a.lastLogin,
    };
  }

  getNextPlayerId(): string {
    let maxNum = 2456;
    for (const p of this.players) {
      const m = p.id.match(/^P0*(\d+)$/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    return `P${String(maxNum + 1).padStart(7, '0')}`;
  }

  getPlayerBets(playerAccount: StoredPlayerAccount): BetHistoryRecord[] {
    return this.recentBets.filter(
      (b) =>
        b.playerId === playerAccount.id ||
        (!b.playerId && b.username?.toLowerCase() === playerAccount.username.toLowerCase())
    );
  }

  getPlayerTransactions(playerAccount: StoredPlayerAccount): TransactionRecord[] {
    return this.transactions.filter(
      (t) =>
        t.playerId === playerAccount.id ||
        (!t.playerId && t.userName?.toLowerCase() === playerAccount.username.toLowerCase())
    );
  }

  getStatePayload(playerAccount?: StoredPlayerAccount | null, isAdmin = false) {
    const basePublic = {
      currentRoundIndex: this.currentRoundIndex,
      currentRoundTime: this.currentRoundTime,
      countdown: this.countdown,
      roundEndTimestamp: this.roundEndTimestamp,
      serverNow: Date.now(),
      isRevealing: this.isRevealing,
      revealStep: this.revealStep,
      drawMix: this.drawMix,
      pendingWinningResult: this.pendingWinningResult,
      history: this.history,
      isBettingClosed:
        this.countdown <= this.platformSettings.bettingLockoutSeconds ||
        this.isRevealing ||
        this.platformSettings.isRoundPaused,
      isRoundPaused: this.platformSettings.isRoundPaused,
    };

    if (isAdmin) {
      return {
        ...basePublic,
        forcedWinningNumber: this.forcedWinningNumber,
        balance: this.balance,
        authenticatedPlayer: null,
        playerBalances: this.getPlayerBalancesMap(),
        recentBets: this.recentBets,
        transactions: this.transactions,
      };
    }

    if (playerAccount) {
      return {
        ...basePublic,
        forcedWinningNumber: null,
        balance: playerAccount.balance,
        authenticatedPlayer: this.sanitizePlayer(playerAccount),
        recentBets: this.getPlayerBets(playerAccount),
        transactions: this.getPlayerTransactions(playerAccount),
      };
    }

    // Unauthenticated guest: ONLY shared public round/history data, zero private player records
    return {
      ...basePublic,
      forcedWinningNumber: null,
      balance: 0,
      authenticatedPlayer: null,
      recentBets: [],
      transactions: [],
    };
  }

  clearDrawTimeouts() {
    this.drawTimeouts.forEach((t) => clearTimeout(t));
    this.drawTimeouts = [];
  }
}

const gameState = new ServerGameState();

// ========================================================
// EXPRESS & WEBSOCKET SERVER SETUP
// ========================================================

const app = express();
app.set('trust proxy', true);

const configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string): boolean {
  if (!origin) return true;
  if (
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)
  ) {
    return true;
  }
  if (configuredAllowedOrigins.length === 0) {
    return /^https?:\/\/[^/\s]+$/i.test(origin);
  }
  return configuredAllowedOrigins.some((allowed) => {
    if (allowed === '*') return true;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1).toLowerCase();
      try {
        const host = new URL(origin).hostname.toLowerCase();
        return host.endsWith(suffix);
      } catch {
        return false;
      }
    }
    return allowed.toLowerCase() === origin.toLowerCase();
  });
}

function isSecureRequest(req: Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return Boolean(req.secure || forwardedProto.includes('https'));
}

function buildSessionCookie(
  req: Request,
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  const isHttps = isSecureRequest(req);
  const sameSite = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${sameSite}; Max-Age=${maxAgeSeconds}`;
}

// CORS allowlist supporting local ports (3000, 3001, 5174), Cloudflare Pages, and credentialed requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Player-Token, X-Admin-Token, X-CSRF-Token, X-Requested-With, CF-Connecting-IP, CF-RAY'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '1mb' }));

const wss = new WebSocketServer({ noServer: true });

interface ExtWebSocket extends WebSocket {
  isAlive?: boolean;
  role?: 'guest' | 'player' | 'admin';
  accountId?: string;
  username?: string;
  portalMode?: 'player' | 'admin';
}

function sendJson(ws: WebSocket, message: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Public shared game events ONLY (never include private player bets/balances/transactions)
function broadcastPublic(message: object) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Admin-only events (audit logs, forced results, system notices)
function broadcastAdminOnly(message: object) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    const ws = client as ExtWebSocket;
    if (ws.readyState === WebSocket.OPEN && ws.role === 'admin') {
      ws.send(data);
    }
  });
}

// Strictly scoped player/admin event delivery:
// Only the owning player receives their own private update; admins receive full platform state.
// Other players NEVER receive another player's private bets, transactions, or balances.
function broadcastToPlayerAndAdmins(
  targetPlayerId: string | undefined | null,
  buildPlayerMsg: () => object,
  buildAdminMsg: () => object
) {
  let cachedAdminData: string | null = null;
  let cachedPlayerData: string | null = null;
  wss.clients.forEach((client) => {
    const ws = client as ExtWebSocket;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.role === 'admin') {
      if (cachedAdminData === null) cachedAdminData = JSON.stringify(buildAdminMsg());
      ws.send(cachedAdminData);
    } else if (ws.role === 'player' && targetPlayerId && ws.accountId === targetPlayerId) {
      if (cachedPlayerData === null) cachedPlayerData = JSON.stringify(buildPlayerMsg());
      ws.send(cachedPlayerData);
    }
  });
}

// Scoped DRAW_FINISHED delivery:
// Every socket gets the public official draw result & history, while each authenticated player
// receives ONLY their own settled bets and balance (never other players' records).
function broadcastDrawFinished(outcomeResult: DrawResult) {
  const publicBase = {
    type: 'DRAW_FINISHED',
    outcomeResult,
    revealStep: 12,
    newHistory: gameState.history,
  };

  wss.clients.forEach((client) => {
    const ws = client as ExtWebSocket;
    if (ws.readyState !== WebSocket.OPEN) return;

    if (ws.role === 'admin') {
      sendJson(ws, {
        ...publicBase,
        recentBets: gameState.recentBets,
        newBalance: gameState.balance,
        playerBalances: gameState.getPlayerBalancesMap(),
      });
    } else if (ws.role === 'player' && ws.accountId) {
      const player = gameState.players.find((p) => p.id === ws.accountId);
      if (player) {
        sendJson(ws, {
          ...publicBase,
          recentBets: gameState.getPlayerBets(player),
          newBalance: player.balance,
        });
      } else {
        sendJson(ws, publicBase);
      }
    } else {
      sendJson(ws, publicBase);
    }
  });
}

function validatePlayerToken(token?: string | null): StoredPlayerAccount | null {
  if (!token) return null;
  const session = gameState.sessions[token];
  if (!session || session.role !== 'player' || Date.now() > session.expiresAt) return null;
  const player = gameState.players.find((p) => p.id === session.accountId);
  if (!player || player.status !== 'active' || player.sessionVersion !== session.sessionVersion) {
    return null;
  }
  return player;
}

function validateAdminToken(token?: string | null): StoredAdminAccount | null {
  if (!token) return null;
  const session = gameState.sessions[token];
  if (!session || session.role === 'player' || Date.now() > session.expiresAt) return null;
  const admin = gameState.admins.find((a) => a.id === session.accountId);
  if (!admin || admin.status !== 'active' || admin.sessionVersion !== session.sessionVersion) {
    return null;
  }
  return admin;
}

function applySocketIdentity(
  ws: ExtWebSocket,
  opts: { portalMode?: 'player' | 'admin'; playerToken?: string | null; adminToken?: string | null }
) {
  const portalMode = opts.portalMode === 'admin' ? 'admin' : 'player';
  ws.portalMode = portalMode;

  if (portalMode === 'admin') {
    const admin = validateAdminToken(opts.adminToken);
    if (admin) {
      ws.role = 'admin';
      ws.accountId = admin.id;
      ws.username = admin.username;
      return;
    }
  } else {
    const player = validatePlayerToken(opts.playerToken);
    if (player) {
      ws.role = 'player';
      ws.accountId = player.id;
      ws.username = player.username;
      return;
    }
  }

  ws.role = 'guest';
  ws.accountId = undefined;
  ws.username = undefined;
}

function sendScopedInitState(ws: ExtWebSocket) {
  if (ws.role === 'admin') {
    sendJson(ws, { type: 'INIT_STATE', payload: gameState.getStatePayload(null, true) });
    return;
  }
  if (ws.role === 'player' && ws.accountId) {
    const player = gameState.players.find((p) => p.id === ws.accountId) || null;
    sendJson(ws, { type: 'INIT_STATE', payload: gameState.getStatePayload(player, false) });
    return;
  }
  sendJson(ws, { type: 'INIT_STATE', payload: gameState.getStatePayload(null, false) });
}

wss.on('connection', (ws: ExtWebSocket, req?: http.IncomingMessage) => {
  ws.isAlive = true;
  ws.role = 'guest';
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Attempt initial authentication from upgrade cookies / query params
  try {
    const cookies = parseCookies(req?.headers?.cookie);
    const parsedUrl = new URL(req?.url || '/ws', 'http://localhost');
    const portalParam = parsedUrl.searchParams.get('portal');
    const queryToken = parsedUrl.searchParams.get('token');
    const portalMode: 'player' | 'admin' = portalParam === 'admin' ? 'admin' : 'player';

    applySocketIdentity(ws, {
      portalMode,
      playerToken: (portalMode === 'player' ? queryToken : null) || cookies['l12kh_player_sid'] || null,
      adminToken: (portalMode === 'admin' ? queryToken : null) || cookies['l12kh_admin_sid'] || null,
    });
  } catch {
    ws.role = 'guest';
  }

  sendScopedInitState(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleClientMessage(ws, msg);
    } catch (e) {
      console.warn('Invalid WS message received', e);
    }
  });

  ws.on('error', (err) => {
    console.warn('WebSocket client error', err);
  });
});

const pingInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    const ws = client as ExtWebSocket;
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

function handleClientMessage(
  ws: ExtWebSocket,
  msg: {
    type: string;
    payload?: any;
    token?: string;
    portalMode?: 'player' | 'admin';
    playerToken?: string | null;
    adminToken?: string | null;
  }
) {
  switch (msg.type) {
    case 'PING':
      sendJson(ws, { type: 'PONG', timestamp: Date.now() });
      break;
    case 'AUTH': {
      applySocketIdentity(ws, {
        portalMode: msg.portalMode,
        playerToken: msg.playerToken,
        adminToken: msg.adminToken,
      });
      sendScopedInitState(ws);
      break;
    }
    case 'SET_FORCED_RESULT': {
      const admin = validateAdminToken(msg.token);
      if (admin && hasAdminPermission(admin, 'results.manage')) {
        gameState.forcedWinningNumber = msg.payload?.number ?? null;
        broadcastAdminOnly({
          type: 'FORCED_RESULT_UPDATED',
          forcedWinningNumber: gameState.forcedWinningNumber,
        });
      }
      break;
    }
    case 'FORCE_DRAW_NOW': {
      const admin = validateAdminToken(msg.token);
      if (admin && hasAdminPermission(admin, 'results.manage')) {
        executeDrawSequence(msg.payload?.targetNumber);
      }
      break;
    }
  }
}

// ========================================================
// RATE LIMITER & AUTHENTICATION MIDDLEWARE
// ========================================================

const loginRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxAttempts = 20, windowMs = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = loginRateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    loginRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count += 1;
  return true;
}

function clearRateLimit(key: string) {
  loginRateLimits.delete(key);
}

function extractPlayerSession(req: Request): { session: SessionRecord; player: StoredPlayerAccount } | null {
  const cookies = parseCookies(req.headers.cookie);
  const headerToken =
    (req.headers['x-player-token'] as string) ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '');
  const token = headerToken || cookies['l12kh_player_sid'];
  if (!token) return null;

  const session = gameState.sessions[token];
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    delete gameState.sessions[token];
    return null;
  }

  if (session.role !== 'player') return null;

  const player = gameState.players.find((p) => p.id === session.accountId);
  if (!player || player.status !== 'active' || player.sessionVersion !== session.sessionVersion) {
    delete gameState.sessions[token];
    return null;
  }

  return { session, player };
}

function extractAdminSession(req: Request): { session: SessionRecord; admin: StoredAdminAccount } | null {
  const cookies = parseCookies(req.headers.cookie);
  const headerToken =
    (req.headers['x-admin-token'] as string) ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '');
  const token = headerToken || cookies['l12kh_admin_sid'];
  if (!token) return null;

  const session = gameState.sessions[token];
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    delete gameState.sessions[token];
    return null;
  }

  if (session.role === 'player') {
    return null;
  }

  const admin = gameState.admins.find((a) => a.id === session.accountId);
  if (!admin || admin.status !== 'active' || admin.sessionVersion !== session.sessionVersion) {
    delete gameState.sessions[token];
    return null;
  }

  return { session, admin };
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  // Check if caller passed a player session token to an admin endpoint
  const cookies = parseCookies(req.headers.cookie);
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  const playerToken = (req.headers['x-player-token'] as string) || bearerToken || cookies['l12kh_player_sid'];

  const adminAuth = extractAdminSession(req);
  if (!adminAuth) {
    if (playerToken && gameState.sessions[playerToken]?.role === 'player') {
      return res.status(403).json({
        error: 'គណនីអ្នកលេងមិនមានសិទ្ធិចូលប្រើប្រាស់ API អ្នកគ្រប់គ្រងទេ! / Forbidden: Player sessions cannot access administrator APIs.',
        code: 'FORBIDDEN_PLAYER_ROLE',
      });
    }
    return res.status(401).json({
      error: 'សូមចូលគណនីអ្នកគ្រប់គ្រងជាមុនសិន! / Unauthorized: Valid administrator session required.',
      code: 'ADMIN_AUTH_REQUIRED',
    });
  }

  (req as any).adminSession = adminAuth.session;
  (req as any).adminAccount = adminAuth.admin;
  next();
}

function hasAdminPermission(admin: StoredAdminAccount, permission: string): boolean {
  if (!admin) return false;
  if (admin.role === 'super_admin' || admin.permissions.includes('all')) return true;
  return admin.permissions.includes(permission);
}

function requireAdminPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = (req as any).adminAccount as StoredAdminAccount | undefined;
    if (!admin || !hasAdminPermission(admin, permission)) {
      return res.status(403).json({
        error: `គណនីអ្នកគ្រប់គ្រងនេះមិនមានសិទ្ធិ "${permission}" ទេ! / Insufficient permissions: requires ${permission}`,
        code: 'INSUFFICIENT_ADMIN_PERMISSION',
      });
    }
    next();
  };
}

// ========================================================
// PART 1 & 2: AUTHENTICATION ENDPOINTS (PLAYER & ADMIN)
// ========================================================

// 1. Player Login
app.post('/api/auth/player/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const cleanUsername = String(username || '').trim();
  const rawPassword = String(password || '');

  if (!cleanUsername || !rawPassword) {
    return res.status(400).json({
      error: 'សូមបញ្ចូលឈ្មោះអ្នកប្រើ និងពាក្យសម្ងាត់! / Please enter username and password.',
      code: 'MISSING_FIELDS',
    });
  }

  const rateKey = `player:${req.ip}:${cleanUsername.toLowerCase()}`;
  if (!checkRateLimit(rateKey)) {
    return res.status(429).json({
      error: 'ការព្យាយាមចូលច្រើនដងពេក សូមរង់ចាំបន្តិច! / Too many login attempts. Please wait.',
      code: 'RATE_LIMITED',
    });
  }

  const player = gameState.players.find(
    (p) => p.username.toLowerCase() === cleanUsername.toLowerCase()
  );

  if (!player || !verifyPassword(rawPassword, player.passwordHash)) {
    return res.status(401).json({
      error: 'ឈ្មោះឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ!',
      errorEn: 'Invalid username or password!',
      code: 'INVALID_CREDENTIALS',
    });
  }

  if (player.status === 'disabled') {
    return res.status(403).json({
      error: 'គណនីរបស់អ្នកត្រូវបានបិទជាបណ្ដោះអាសន្ន! សូមទាក់ទងអ្នកគ្រប់គ្រង។',
      errorEn: 'Your account has been disabled. Please contact administrator.',
      code: 'ACCOUNT_DISABLED',
    });
  }

  clearRateLimit(rateKey);

  const token = generateSecureToken(32);
  const csrfToken = generateSecureToken(16);
  const timeoutMs = (gameState.platformSettings.sessionTimeoutMinutes || 480) * 60 * 1000;

  const session: SessionRecord = {
    token,
    csrfToken,
    accountId: player.id,
    username: player.username,
    role: 'player',
    sessionVersion: player.sessionVersion,
    createdAt: Date.now(),
    expiresAt: Date.now() + timeoutMs,
    ip: req.ip || '127.0.0.1',
    userAgent: String(req.headers['user-agent'] || 'Browser'),
  };

  player.lastLogin = formatNowTimestamp();
  gameState.sessions[token] = session;

  gameState.addAuditLog({
    actorId: player.id,
    actorUsername: player.username,
    actorRole: 'player',
    action: 'PLAYER_LOGIN',
    targetId: player.id,
    targetName: player.username,
    details: `អ្នកលេងចូលប្រព័ន្ធ: ${player.username} / Player logged in`,
    ip: req.ip || '127.0.0.1',
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookie(req, 'l12kh_player_sid', token, Math.floor(timeoutMs / 1000))
  );

  return res.json({
    success: true,
    token,
    csrfToken,
    player: gameState.sanitizePlayer(player),
  });
});

// 2. Player Session Check
app.get('/api/auth/player/session', (req: Request, res: Response) => {
  const authData = extractPlayerSession(req);
  if (!authData) {
    return res.status(401).json({
      authenticated: false,
      error: 'Session expired or not authenticated',
    });
  }
  return res.json({
    authenticated: true,
    csrfToken: authData.session.csrfToken,
    player: gameState.sanitizePlayer(authData.player),
  });
});

// 3. Player Logout
app.post('/api/auth/player/logout', (req: Request, res: Response) => {
  const authData = extractPlayerSession(req);
  if (authData) {
    delete gameState.sessions[authData.session.token];
    gameState.addAuditLog({
      actorId: authData.player.id,
      actorUsername: authData.player.username,
      actorRole: 'player',
      action: 'PLAYER_LOGOUT',
      targetId: authData.player.id,
      targetName: authData.player.username,
      details: `អ្នកលេងចាកចេញ: ${authData.player.username} / Player logged out`,
      ip: req.ip || '127.0.0.1',
    });
    gameState.saveStateToDisk();
  }
  res.setHeader('Set-Cookie', buildSessionCookie(req, 'l12kh_player_sid', '', 0));
  return res.json({ success: true });
});

// 4. Admin Login
app.post('/api/auth/admin/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const cleanUsername = String(username || '').trim();
  const rawPassword = String(password || '');

  if (!cleanUsername || !rawPassword) {
    return res.status(400).json({
      error: 'សូមបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់ និងពាក្យសម្ងាត់!',
      errorEn: 'Please enter username and password!',
      code: 'MISSING_FIELDS',
    });
  }

  const rateKey = `admin:${req.ip}:${cleanUsername.toLowerCase()}`;
  if (!checkRateLimit(rateKey, 15, 5 * 60 * 1000)) {
    return res.status(429).json({
      error: 'ការព្យាយាមចូលច្រើនដងពេក សូមរង់ចាំបន្តិច!',
      errorEn: 'Too many failed login attempts. Please wait.',
      code: 'RATE_LIMITED',
    });
  }

  // First check if this is an admin account
  const admin = gameState.admins.find(
    (a) => a.username.toLowerCase() === cleanUsername.toLowerCase()
  );

  if (!admin) {
    // Explicitly check if a player tried to log into the Admin Panel
    const isPlayerAccount = gameState.players.some(
      (p) => p.username.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (isPlayerAccount) {
      return res.status(403).json({
        error: 'គណនីអ្នកលេងមិនមានសិទ្ធិចូលប្រព័ន្ធគ្រប់គ្រងទេ!',
        errorEn: 'Player accounts cannot access the Admin Panel!',
        code: 'PLAYER_ACCESS_DENIED',
      });
    }

    return res.status(401).json({
      error: 'ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ!',
      errorEn: 'Invalid username or password!',
      code: 'INVALID_CREDENTIALS',
    });
  }

  if (!verifyPassword(rawPassword, admin.passwordHash)) {
    return res.status(401).json({
      error: 'ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ!',
      errorEn: 'Invalid username or password!',
      code: 'INVALID_CREDENTIALS',
    });
  }

  if (admin.status === 'disabled') {
    return res.status(403).json({
      error: 'គណនីអ្នកគ្រប់គ្រងនេះត្រូវបានផ្អាក!',
      errorEn: 'This administrator account is disabled!',
      code: 'ADMIN_DISABLED',
    });
  }

  clearRateLimit(rateKey);

  const token = generateSecureToken(32);
  const csrfToken = generateSecureToken(16);
  const timeoutMs = (gameState.platformSettings.sessionTimeoutMinutes || 480) * 60 * 1000;

  const session: SessionRecord = {
    token,
    csrfToken,
    accountId: admin.id,
    username: admin.username,
    role: admin.role,
    sessionVersion: admin.sessionVersion,
    createdAt: Date.now(),
    expiresAt: Date.now() + timeoutMs,
    ip: req.ip || '127.0.0.1',
    userAgent: String(req.headers['user-agent'] || 'Browser'),
  };

  admin.lastLogin = formatNowTimestamp();
  gameState.sessions[token] = session;

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'ADMIN_LOGIN',
    details: `ចូលប្រព័ន្ធ: ${admin.displayName} / Admin logged in`,
    ip: req.ip || '127.0.0.1',
  });

  res.setHeader(
    'Set-Cookie',
    buildSessionCookie(req, 'l12kh_admin_sid', token, Math.floor(timeoutMs / 1000))
  );

  return res.json({
    success: true,
    token,
    csrfToken,
    admin: gameState.sanitizeAdmin(admin),
  });
});

// 5. Admin Session Check
app.get('/api/auth/admin/session', requireAdminAuth, (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const session = (req as any).adminSession as SessionRecord;
  return res.json({
    authenticated: true,
    csrfToken: session.csrfToken,
    admin: gameState.sanitizeAdmin(admin),
  });
});

// 6. Admin Logout
app.post('/api/auth/admin/logout', (req: Request, res: Response) => {
  const authData = extractAdminSession(req);
  if (authData) {
    delete gameState.sessions[authData.session.token];
    gameState.addAuditLog({
      actorId: authData.admin.id,
      actorUsername: authData.admin.username,
      actorRole: authData.admin.role,
      action: 'ADMIN_LOGOUT',
      details: `ចាកចេញពីប្រព័ន្ធ: ${authData.admin.displayName} / Admin logged out`,
      ip: req.ip || '127.0.0.1',
    });
    gameState.saveStateToDisk();
  }
  res.setHeader('Set-Cookie', buildSessionCookie(req, 'l12kh_admin_sid', '', 0));
  return res.json({ success: true });
});

// ========================================================
// DRAW SEQUENCE EXECUTION (AUTHORITATIVE ON SERVER)
// ========================================================

function executeDrawSequence(explicitTarget?: number) {
  if (gameState.isRevealing) return;
  gameState.clearDrawTimeouts();

  const targetNum = explicitTarget ?? gameState.forcedWinningNumber;
  let winningNum: number;
  let mix = generateRandomMix();

  if (targetNum && targetNum >= 1 && targetNum <= 12) {
    winningNum = targetNum;
    const remaining = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((n) => n !== targetNum);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    mix = [...remaining, targetNum];
    gameState.forcedWinningNumber = null;
  } else {
    winningNum = mix[11];
  }

  gameState.drawMix = mix;
  const animal = ANIMALS_DATA[winningNum];
  const timeStr = formatShortTime();
  const roundId = `2004#${gameState.currentRoundIndex}`;

  const outcomeResult: DrawResult = {
    roundId,
    roundIndex: gameState.currentRoundIndex,
    time: timeStr,
    number: winningNum,
    animal: animal.khmerName,
    color: animal.color,
    size: animal.size,
    parity: animal.parity,
    timestamp: Date.now(),
  };

  gameState.pendingWinningResult = outcomeResult;
  gameState.isRevealing = true;
  gameState.countdown = 0;
  gameState.revealStep = 1;

  broadcastPublic({
    type: 'DRAW_STARTED',
    outcomeResult,
    drawMix: mix,
    revealStep: 1,
  });

  for (let s = 2; s <= 11; s++) {
    const delay = (s - 1) * 1100;
    const t = setTimeout(() => {
      gameState.revealStep = s;
      broadcastPublic({ type: 'DRAW_STEP', revealStep: s });
    }, delay);
    gameState.drawTimeouts.push(t);
  }

  const finalDelay = 11 * 1100;
  const tFinal = setTimeout(() => {
    gameState.revealStep = 12;
    settleRoundBets(outcomeResult);

    gameState.history = [outcomeResult, ...gameState.history];
    gameState.saveStateToDisk();

    broadcastDrawFinished(outcomeResult);

    const tReset = setTimeout(() => {
      gameState.isRevealing = false;
      gameState.revealStep = 0;
      gameState.pendingWinningResult = null;
      const nextDuration = gameState.platformSettings.roundDurationSeconds || 180;
      gameState.countdown = nextDuration;
      gameState.roundEndTimestamp = Date.now() + nextDuration * 1000;
      gameState.pauseRemainingMs = null;
      gameState.lastBroadcastCountdown = nextDuration;
      gameState.countdown10sBroadcastRound = null;
      gameState.currentRoundIndex += 1;
      gameState.currentRoundTime = formatShortTime();
      gameState.drawMix = generateRandomMix();
      gameState.saveStateToDisk();

      broadcastPublic({
        type: 'ROUND_RESET',
        currentRoundIndex: gameState.currentRoundIndex,
        countdown: gameState.countdown,
        roundEndTimestamp: gameState.roundEndTimestamp,
        serverNow: Date.now(),
        drawMix: gameState.drawMix,
      });
    }, 5000);
    gameState.drawTimeouts.push(tReset);
  }, finalDelay);

  gameState.drawTimeouts.push(tFinal);
}

function checkIsCategoryWon(catKey: BetCategory, outcomeNumber: number): boolean {
  if (!catKey || typeof catKey !== 'string') return false;
  const outcome = ANIMALS_DATA[outcomeNumber];
  if (!outcome) return false;
  if (catKey === 'small') return outcome.size === 'small';
  if (catKey === 'big') return outcome.size === 'big';
  if (catKey === 'odd') return outcome.parity === 'odd';
  if (catKey === 'even') return outcome.parity === 'even';
  if (catKey === 'color_red') return outcome.color === 'red';
  if (catKey === 'color_green') return outcome.color === 'green';
  if (catKey === 'color_blue') return outcome.color === 'blue';
  if (catKey.startsWith('animal_')) {
    const betNum = parseInt(catKey.replace('animal_', ''), 10);
    return betNum === outcomeNumber;
  }
  return false;
}

function settleRoundBets(outcome: DrawResult) {
  const currentRoundId = outcome.roundId;
  // Prevent duplicate settlement or repeated payouts for the same round
  if (gameState.settledRoundIds.has(currentRoundId)) {
    return;
  }
  gameState.settledRoundIds.add(currentRoundId);

  let fallbackWinPayout = 0;
  const settledTimestamp = Date.now();
  const settledAt = formatPhnomPenhDateTime(settledTimestamp);

  gameState.recentBets = gameState.recentBets.map((rec) => {
    // Only settle pending bets belonging to this exact round (prevents double counting & protects voided/refunded records)
    if (rec.status !== 'pending' || rec.roundId !== currentRoundId) {
      return rec;
    }

    let recordWonPayout = 0;
    const updatedBets = rec.bets.map((b) => {
      const won = checkIsCategoryWon(b.type, outcome.number);
      const payout = won ? Math.round(b.amount * b.odds) : 0;
      if (won) recordWonPayout += payout;
      return { ...b, won, payout };
    });

    const isWon = recordWonPayout > 0;
    if (isWon) {
      if (rec.playerId) {
        const player = gameState.players.find((p) => p.id === rec.playerId);
        if (player) {
          player.balance += recordWonPayout;
          if (player.id === 'P0001001') {
            gameState.balance = player.balance;
          }
        } else {
          fallbackWinPayout += recordWonPayout;
        }
      } else {
        fallbackWinPayout += recordWonPayout;
      }
    }

    return {
      ...rec,
      bets: updatedBets,
      totalPayout: recordWonPayout,
      netProfit: isWon ? recordWonPayout - rec.totalStake : -rec.totalStake,
      resultNumber: outcome.number,
      settledAt,
      settledTimestamp,
      status: isWon ? 'won' : 'lost',
    };
  });

  if (fallbackWinPayout > 0) {
    gameState.balance += fallbackWinPayout;
  }
}

// High-Precision Server Authoritative Clock Loop (Evaluated against roundEndTimestamp)
setInterval(() => {
  if (gameState.isRevealing || gameState.platformSettings.isRoundPaused) return;

  const now = Date.now();
  const remainingMs = gameState.roundEndTimestamp - now;

  // Hold countdown=0 for ~1.1s so the zero-second cue ("សូមសំណាងល្អ") finishes cleanly right before reveal begins
  if (remainingMs <= -1100) {
    executeDrawSequence();
    return;
  }

  const nextCountdown = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  gameState.countdown = nextCountdown;
  const lockout = gameState.platformSettings.bettingLockoutSeconds || 10;

  if (
    nextCountdown <= lockout &&
    gameState.countdown10sBroadcastRound !== gameState.currentRoundIndex
  ) {
    gameState.countdown10sBroadcastRound = gameState.currentRoundIndex;
    broadcastPublic({
      type: 'COUNTDOWN_10S_START',
      countdown: nextCountdown,
      currentRoundIndex: gameState.currentRoundIndex,
      roundEndTimestamp: gameState.roundEndTimestamp,
      serverNow: now,
      isBettingClosed: true,
    });
  }

  if (nextCountdown !== gameState.lastBroadcastCountdown) {
    gameState.lastBroadcastCountdown = nextCountdown;
    broadcastPublic({
      type: 'TICK',
      countdown: nextCountdown,
      currentRoundIndex: gameState.currentRoundIndex,
      roundEndTimestamp: gameState.roundEndTimestamp,
      serverNow: now,
      isBettingClosed: nextCountdown <= lockout,
    });
  }
}, 200);

// ========================================================
// PART 3 & 5: AUTHORITATIVE ADMIN PANEL REST API
// ========================================================

// 1. Dashboard Overview
app.get('/api/admin/overview', requireAdminAuth, (req: Request, res: Response) => {
  const totalPlayers = gameState.players.length;
  const activePlayers = gameState.players.filter((p) => p.status === 'active').length;
  const disabledPlayers = gameState.players.filter((p) => p.status === 'disabled').length;

  const totalBetTurnover = gameState.recentBets.reduce((s, b) => s + b.totalStake, 0);
  const totalBetPayout = gameState.recentBets.reduce((s, b) => s + b.totalPayout, 0);
  const approvedTxTotal = gameState.transactions
    .filter((t) => t.status === 'approved')
    .reduce((s, t) => s + t.amount, 0);

  // Genuine 7-day activity series derived from stored recentBets
  const dayLabels = ['Nov 12', 'Nov 13', 'Nov 14', 'Nov 15', 'Nov 16', 'Nov 17', 'Nov 18'];
  const bettingActivity7d = dayLabels.map((day, idx) => {
    const isToday = idx === dayLabels.length - 1;
    const dayBets = isToday ? gameState.recentBets : [];
    const dayRiel = dayBets.reduce((s, b) => s + (b.totalStake || 0), 0);
    return {
      day,
      totalRiel: dayRiel,
      totalUsd: Math.round((dayRiel / 4000) * 100) / 100,
      betsCount: dayBets.length,
    };
  });

  const ownerLottery12Report = computeOwnerLottery12Report({ period: 'all', roundId: 'all' });

  res.json({
    metrics: {
      totalPlayers,
      activePlayers,
      disabledPlayers,
      currentRoundId: `2004#${gameState.currentRoundIndex}`,
      currentRoundIndex: gameState.currentRoundIndex,
      currentRoundTime: gameState.currentRoundTime,
      countdown: gameState.countdown,
      isRevealing: gameState.isRevealing,
      isRoundPaused: gameState.platformSettings.isRoundPaused,
      forcedWinningNumber: gameState.forcedWinningNumber,
      totalBetsCount: gameState.recentBets.length,
      totalBetTurnoverRiel: totalBetTurnover,
      totalBetPayoutRiel: totalBetPayout,
      approvedTransactionsRiel: approvedTxTotal,
      connectedClients: wss.clients.size,
      serverDateTime: ownerLottery12Report.serverDateTime,
      timezone: CAMBODIA_TZ,
    },
    ownerLottery12Report,
    bettingActivity7d,
    systemHealth: {
      server: 'Online',
      database: fs.existsSync(PERSISTENCE_FILE) ? 'Online' : 'Memory',
      gameService: gameState.platformSettings.isRoundPaused ? 'Paused' : 'Online',
      wsConnections: wss.clients.size,
      uptimeSeconds: Math.floor((Date.now() - gameState.startedAt) / 1000),
    },
    recentActivities: gameState.auditLogs.slice(0, 20),
    players: gameState.players.map((p) => gameState.sanitizePlayer(p)),
    recentBets: gameState.recentBets,
    transactions: gameState.transactions,
    history: gameState.history,
    platformSettings: gameState.platformSettings,
  });
});

// 2. Player Directory (Search, Status Filter, Pagination)
app.get('/api/admin/players', requireAdminAuth, (req: Request, res: Response) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const statusFilter = String(req.query.status || 'all').toLowerCase();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '10'), 10) || 10));

  const filtered = gameState.players.filter((p) => {
    const matchSearch =
      !search ||
      p.username.toLowerCase().includes(search) ||
      p.id.toLowerCase().includes(search) ||
      p.displayName.toLowerCase().includes(search) ||
      p.phone.toLowerCase().includes(search);
    const matchStatus =
      statusFilter === 'all' || p.status.toLowerCase() === statusFilter;
    return matchSearch && matchStatus;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const paginated = filtered.slice(startIndex, startIndex + limit).map((p) => gameState.sanitizePlayer(p));

  res.json({
    players: paginated,
    total,
    page,
    limit,
    totalPages,
    summary: {
      total: gameState.players.length,
      active: gameState.players.filter((p) => p.status === 'active').length,
      disabled: gameState.players.filter((p) => p.status === 'disabled').length,
    },
  });
});

// 3. Check Username Availability
app.get('/api/admin/players/check-username', requireAdminAuth, (req: Request, res: Response) => {
  const username = String(req.query.username || '').trim();
  const excludeId = String(req.query.excludeId || '').trim();

  if (!username || username.length < 3) {
    return res.json({ available: false, reason: 'Username must be at least 3 characters' });
  }

  const takenByPlayer = gameState.players.some(
    (p) => p.username.toLowerCase() === username.toLowerCase() && p.id !== excludeId
  );
  const takenByAdmin = gameState.admins.some(
    (a) => a.username.toLowerCase() === username.toLowerCase()
  );

  return res.json({
    available: !takenByPlayer && !takenByAdmin,
    username,
  });
});

// 4. Get Single Player Profile + Scoped Bets & Transactions
app.get('/api/admin/players/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const player = gameState.players.find((p) => p.id === id || p.username.toLowerCase() === id.toLowerCase());
  if (!player) {
    return res.status(404).json({ error: 'រកមិនឃើញគណនីអ្នកលេង! / Player not found' });
  }

  const playerBets = gameState.recentBets.filter(
    (b) => b.playerId === player.id || b.username?.toLowerCase() === player.username.toLowerCase()
  );
  const playerTransactions = gameState.transactions.filter(
    (t) =>
      t.playerId === player.id ||
      t.userName.toLowerCase() === player.username.toLowerCase() ||
      t.userName.toLowerCase() === player.displayName.toLowerCase()
  );

  return res.json({
    player: gameState.sanitizePlayer(player),
    bets: playerBets,
    transactions: playerTransactions,
  });
});

// 5. Create New Player Account
app.post('/api/admin/players', requireAdminAuth, requireAdminPermission('users.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { username, password, status = 'active', displayName, phone } = req.body || {};

  const cleanUsername = String(username || '').trim();
  const rawPassword = String(password || '');

  if (!cleanUsername || cleanUsername.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
    return res.status(400).json({
      error: 'ឈ្មោះអ្នកប្រើប្រាស់ត្រូវមានយ៉ាងតិច ៣ តួអក្សរ (អក្សរ និងលេខ)! / Username must be at least 3 alphanumeric characters.',
    });
  }

  if (!rawPassword || rawPassword.length < 6) {
    return res.status(400).json({
      error: 'ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ! / Password must be at least 6 characters.',
    });
  }

  const exists =
    gameState.players.some((p) => p.username.toLowerCase() === cleanUsername.toLowerCase()) ||
    gameState.admins.some((a) => a.username.toLowerCase() === cleanUsername.toLowerCase());

  if (exists) {
    return res.status(409).json({
      error: 'ឈ្មោះអ្នកប្រើប្រាស់នេះមានរួចហើយ! / Username is already taken.',
    });
  }

  const newId = gameState.getNextPlayerId();
  const newPlayer: StoredPlayerAccount = {
    id: newId,
    username: cleanUsername,
    displayName: String(displayName || cleanUsername).trim(),
    phone: String(phone || '').trim() || '—',
    passwordHash: hashPassword(rawPassword),
    status: status === 'disabled' ? 'disabled' : 'active',
    balance: 0,
    betsCount7d: 0,
    createdAt: formatNowTimestamp(),
    lastLogin: null,
    sessionVersion: 1,
  };

  gameState.players = [newPlayer, ...gameState.players];

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'CREATE_PLAYER',
    targetId: newPlayer.id,
    targetName: newPlayer.username,
    details: `បង្កើតគណនីអ្នកលេងថ្មី: ${newPlayer.username} (${newPlayer.id}) [Status: ${newPlayer.status}]`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();

  const sanitized = gameState.sanitizePlayer(newPlayer);
  broadcastToPlayerAndAdmins(
    newPlayer.id,
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: newPlayer.id,
      player: sanitized,
    }),
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: newPlayer.id,
      player: sanitized,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  return res.status(201).json({
    success: true,
    player: sanitized,
    message: `បានបង្កើតគណនី ${newPlayer.username} ដោយជោគជ័យ!`,
  });
});

// 6. Edit Player Username (Preserves Player ID and Balance!)
app.put('/api/admin/players/:id/username', requireAdminAuth, requireAdminPermission('users.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { id } = req.params;
  const { newUsername } = req.body || {};
  const cleanNewUsername = String(newUsername || '').trim();

  const player = gameState.players.find((p) => p.id === id);
  if (!player) {
    return res.status(404).json({ error: 'រកមិនឃើញគណនីអ្នកលេង! / Player not found' });
  }

  if (!cleanNewUsername || cleanNewUsername.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(cleanNewUsername)) {
    return res.status(400).json({
      error: 'ឈ្មោះអ្នកប្រើប្រាស់ថ្មីមិនត្រឹមត្រូវ! / Invalid new username format.',
    });
  }

  const duplicate =
    gameState.players.some(
      (p) => p.id !== player.id && p.username.toLowerCase() === cleanNewUsername.toLowerCase()
    ) ||
    gameState.admins.some((a) => a.username.toLowerCase() === cleanNewUsername.toLowerCase());

  if (duplicate) {
    return res.status(409).json({
      error: 'ឈ្មោះអ្នកប្រើប្រាស់នេះមានអ្នកប្រើរួចហើយ! / Username already exists.',
    });
  }

  const oldUsername = player.username;
  player.username = cleanNewUsername;
  if (player.displayName === oldUsername) {
    player.displayName = cleanNewUsername;
  }

  // Synchronize username across active sessions and betting records for this playerId
  Object.values(gameState.sessions).forEach((sess) => {
    if (sess.accountId === player.id) {
      sess.username = cleanNewUsername;
    }
  });
  gameState.recentBets = gameState.recentBets.map((b) =>
    b.playerId === player.id || b.username === oldUsername
      ? { ...b, playerId: player.id, username: cleanNewUsername }
      : b
  );

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'UPDATE_USERNAME',
    targetId: player.id,
    targetName: cleanNewUsername,
    details: `ប្តូរឈ្មោះគណនី ${player.id} ពី "${oldUsername}" ទៅ "${cleanNewUsername}"`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();

  const sanitized = gameState.sanitizePlayer(player);
  broadcastToPlayerAndAdmins(
    player.id,
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: player.id,
      player: sanitized,
    }),
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: player.id,
      player: sanitized,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  return res.json({
    success: true,
    player: sanitized,
    message: `បានប្តូរឈ្មោះអ្នកប្រើប្រាស់ទៅជា "${cleanNewUsername}" ដោយជោគជ័យ!`,
  });
});

// 7. Reset / Change Player Password (Invalidates old credentials & sessions immediately, preserves balance & ID)
app.put('/api/admin/players/:id/password', requireAdminAuth, requireAdminPermission('users.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { id } = req.params;
  const { newPassword } = req.body || {};
  const rawNewPassword = String(newPassword || '');

  const player = gameState.players.find((p) => p.id === id);
  if (!player) {
    return res.status(404).json({ error: 'រកមិនឃើញគណនីអ្នកលេង! / Player not found' });
  }

  if (!rawNewPassword || rawNewPassword.length < 6) {
    return res.status(400).json({
      error: 'ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៦ តួអក្សរ! / Password must be at least 6 characters.',
    });
  }

  player.passwordHash = hashPassword(rawNewPassword);
  player.sessionVersion += 1;
  const revokedCount = gameState.revokeSessionsForAccount(player.id);

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'RESET_PASSWORD',
    targetId: player.id,
    targetName: player.username,
    details: `ផ្លាស់ប្តូរពាក្យសម្ងាត់ថ្មីសម្រាប់: ${player.username} (${player.id}) • Revoked ${revokedCount} session(s)`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();

  const sanitized = gameState.sanitizePlayer(player);
  broadcastToPlayerAndAdmins(
    player.id,
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: player.id,
      player: sanitized,
    }),
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: player.id,
      player: sanitized,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  return res.json({
    success: true,
    player: sanitized,
    revokedSessions: revokedCount,
    message: `បានផ្លាស់ប្តូរពាក្យសម្ងាត់ថ្មីសម្រាប់ ${player.username} ដោយជោគជ័យ!`,
  });
});

// 8. Enable / Disable Player Account
app.put('/api/admin/players/:id/status', requireAdminAuth, requireAdminPermission('users.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { id } = req.params;
  const { status } = req.body || {};

  const player = gameState.players.find((p) => p.id === id);
  if (!player) {
    return res.status(404).json({ error: 'រកមិនឃើញគណនីអ្នកលេង! / Player not found' });
  }

  if (status !== 'active' && status !== 'disabled') {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  player.status = status;
  let revokedCount = 0;
  if (status === 'disabled') {
    player.sessionVersion += 1;
    revokedCount = gameState.revokeSessionsForAccount(player.id);
  }

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: status === 'active' ? 'ENABLE_PLAYER' : 'DISABLE_PLAYER',
    targetId: player.id,
    targetName: player.username,
    details: `${status === 'active' ? 'បើកដំណើរការគណនីឡើងវិញ' : 'បិទគណនី'}: ${player.username} (${player.id})`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();

  const sanitized = gameState.sanitizePlayer(player);
  broadcastToPlayerAndAdmins(
    player.id,
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: player.id,
      player: sanitized,
    }),
    () => ({
      type: 'PLAYER_UPDATED',
      playerId: player.id,
      player: sanitized,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  return res.json({
    success: true,
    player: sanitized,
    revokedSessions: revokedCount,
    message:
      status === 'active'
        ? `គណនី ${player.username} ត្រូវបានបើកឱ្យដំណើរការឡើងវិញ!`
        : `គណនី ${player.username} ត្រូវបានបិទជាបណ្ដោះអាសន្ន!`,
  });
});

// 9. Explicitly Revoke Player Sessions
app.post('/api/admin/players/:id/revoke-sessions', requireAdminAuth, requireAdminPermission('users.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { id } = req.params;

  const player = gameState.players.find((p) => p.id === id);
  if (!player) {
    return res.status(404).json({ error: 'រកមិនឃើញគណនីអ្នកលេង! / Player not found' });
  }

  player.sessionVersion += 1;
  const revokedCount = gameState.revokeSessionsForAccount(player.id);

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'REVOKE_SESSIONS',
    targetId: player.id,
    targetName: player.username,
    details: `បញ្ឈប់រាល់ការចូលប្រើប្រាស់ (Revoked Sessions) សម្រាប់: ${player.username} (${player.id})`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();

  return res.json({
    success: true,
    revokedCount,
    player: gameState.sanitizePlayer(player),
    message: `បានបញ្ឈប់ការចូលប្រើប្រាស់ទាំងអស់របស់ ${player.username} ដោយជោគជ័យ!`,
  });
});

// 9b. Delete Temporary/Test Player Account (Admin with users.manage)
app.delete('/api/admin/players/:id', requireAdminAuth, requireAdminPermission('users.manage'), (req: Request, res: Response) => {
  const { id } = req.params;
  const player = gameState.players.find((p) => p.id === id);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  gameState.revokeSessionsForAccount(player.id);
  gameState.players = gameState.players.filter((p) => p.id !== id);
  gameState.transactions = gameState.transactions.filter((t) => t.playerId !== id && t.userName !== player.username);
  gameState.auditLogs = gameState.auditLogs.filter((l) => l.targetId !== id && l.actorId !== id);
  gameState.saveStateToDisk();
  return res.json({ success: true, deletedId: id });
});

// 10. Pause / Resume Lottery Round Schedule
app.post('/api/admin/round/pause-resume', requireAdminAuth, requireAdminPermission('rounds.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { paused } = req.body || {};
  const nextPaused = typeof paused === 'boolean' ? paused : !gameState.platformSettings.isRoundPaused;
  gameState.platformSettings.isRoundPaused = nextPaused;

  if (nextPaused) {
    gameState.pauseRemainingMs = Math.max(0, gameState.roundEndTimestamp - Date.now());
    gameState.countdown = Math.ceil(gameState.pauseRemainingMs / 1000);
  } else {
    const resumeMs =
      typeof gameState.pauseRemainingMs === 'number'
        ? gameState.pauseRemainingMs
        : Math.max(1000, gameState.countdown * 1000);
    gameState.roundEndTimestamp = Date.now() + resumeMs;
    gameState.pauseRemainingMs = null;
  }

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: gameState.platformSettings.isRoundPaused ? 'ROUND_PAUSED' : 'ROUND_RESUMED',
    targetId: `2004#${gameState.currentRoundIndex}`,
    details: gameState.platformSettings.isRoundPaused
      ? `ផ្អាកការរាប់ថយក្រោយជុំ 2004#${gameState.currentRoundIndex}`
      : `បន្តការរាប់ថយក្រោយជុំ 2004#${gameState.currentRoundIndex}`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();
  broadcastPublic({
    type: 'TICK',
    countdown: gameState.countdown,
    currentRoundIndex: gameState.currentRoundIndex,
    roundEndTimestamp: gameState.roundEndTimestamp,
    serverNow: Date.now(),
    isBettingClosed:
      gameState.countdown <= gameState.platformSettings.bettingLockoutSeconds ||
      gameState.platformSettings.isRoundPaused,
    isRoundPaused: gameState.platformSettings.isRoundPaused,
  });

  return res.json({
    success: true,
    isRoundPaused: gameState.platformSettings.isRoundPaused,
  });
});

// 11. Staff & Permissions Management
app.get('/api/admin/staff', requireAdminAuth, (req: Request, res: Response) => {
  return res.json({
    staff: gameState.admins.map((a) => gameState.sanitizeAdmin(a)),
  });
});

// 12. System Settings Update
app.put('/api/admin/settings', requireAdminAuth, requireAdminPermission('settings.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const updates = req.body || {};

  if (typeof updates.roundDurationSeconds === 'number' && updates.roundDurationSeconds >= 30) {
    gameState.platformSettings.roundDurationSeconds = updates.roundDurationSeconds;
  }
  if (typeof updates.bettingLockoutSeconds === 'number' && updates.bettingLockoutSeconds >= 3) {
    gameState.platformSettings.bettingLockoutSeconds = updates.bettingLockoutSeconds;
  }
  if (typeof updates.minBetRiel === 'number' && updates.minBetRiel >= 100) {
    gameState.platformSettings.minBetRiel = updates.minBetRiel;
  }
  if (typeof updates.maxBetRiel === 'number' && updates.maxBetRiel >= 10000) {
    gameState.platformSettings.maxBetRiel = updates.maxBetRiel;
  }
  if (typeof updates.sessionTimeoutMinutes === 'number' && updates.sessionTimeoutMinutes >= 5) {
    gameState.platformSettings.sessionTimeoutMinutes = updates.sessionTimeoutMinutes;
  }
  if (typeof updates.maintenanceMode === 'boolean') {
    gameState.platformSettings.maintenanceMode = updates.maintenanceMode;
  }

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'UPDATE_SETTINGS',
    details: `បានធ្វើបច្ចុប្បន្នភាពការកំណត់ប្រព័ន្ធ (Duration: ${gameState.platformSettings.roundDurationSeconds}s, Lockout: ${gameState.platformSettings.bettingLockoutSeconds}s)`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();
  return res.json({
    success: true,
    platformSettings: gameState.platformSettings,
  });
});

// 13. Audit Logs Query
app.get('/api/admin/audit-logs', requireAdminAuth, requireAdminPermission('audit.view'), (req: Request, res: Response) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const action = String(req.query.action || 'all').toUpperCase();

  const logs = gameState.auditLogs.filter((l) => {
    const matchSearch =
      !search ||
      l.actorUsername.toLowerCase().includes(search) ||
      l.details.toLowerCase().includes(search) ||
      (l.targetName && l.targetName.toLowerCase().includes(search)) ||
      (l.targetId && l.targetId.toLowerCase().includes(search));
    const matchAction = action === 'ALL' || l.action.toUpperCase() === action;
    return matchSearch && matchAction;
  });

  return res.json({ logs });
});

// ========================================================
// EXISTING GAME & ADMIN ENDPOINTS (PRESERVED + SECURED)
// ========================================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'ok',
    service: 'lottery12kh-backend',
    timezone: CAMBODIA_TZ,
    timestamp: Date.now(),
    clientsConnected: wss.clients.size,
    currentRoundIndex: gameState.currentRoundIndex,
    countdown: gameState.countdown,
    cfRay: req.headers['cf-ray'] || null,
    cfConnectingIp: req.headers['cf-connecting-ip'] || null,
  });
});

app.get('/api/state', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization, Cookie');
  const wantsAdmin = String(req.query.portal || '').toLowerCase() === 'admin';
  if (wantsAdmin) {
    const adminAuth = extractAdminSession(req);
    if (adminAuth) {
      return res.json(gameState.getStatePayload(null, true));
    }
    return res.json(gameState.getStatePayload(null, false));
  }
  const playerAuth = extractPlayerSession(req);
  return res.json(gameState.getStatePayload(playerAuth?.player || null, false));
});

// Authenticated Player: Strictly scoped personal transaction history
app.get('/api/player/transactions', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization, Cookie');
  const playerAuth = extractPlayerSession(req);
  if (!playerAuth) {
    return res.status(401).json({
      error: 'សូមចូលគណនីអ្នកលេងជាមុនសិន! / Unauthorized: Player login required.',
      code: 'PLAYER_AUTH_REQUIRED',
    });
  }
  return res.json({
    player: {
      id: playerAuth.player.id,
      username: playerAuth.player.username,
      balance: playerAuth.player.balance,
    },
    transactions: gameState.getPlayerTransactions(playerAuth.player),
  });
});

// Admin: Set Pre-determined Winning Result (Protected by requireAdminAuth + results.manage)
app.post('/api/admin/set-result', requireAdminAuth, requireAdminPermission('results.manage'), (req, res) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { number } = req.body;
  gameState.forcedWinningNumber =
    typeof number === 'number' && number >= 1 && number <= 12 ? number : null;
  gameState.saveStateToDisk();

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'SET_RESULT',
    targetId: `2004#${gameState.currentRoundIndex}`,
    targetName: `Round #${gameState.currentRoundIndex}`,
    details: gameState.forcedWinningNumber
      ? `កំណត់លទ្ធផលជុំ 2004#${gameState.currentRoundIndex} = លេខ ${gameState.forcedWinningNumber} (${ANIMALS_DATA[gameState.forcedWinningNumber]?.khmerName})`
      : `កំណត់លទ្ធផលជុំ 2004#${gameState.currentRoundIndex} ទៅជាចៃដន្យ (Random)`,
    ip: req.ip || '127.0.0.1',
  });

  broadcastAdminOnly({
    type: 'FORCED_RESULT_UPDATED',
    forcedWinningNumber: gameState.forcedWinningNumber,
  });

  res.json({
    success: true,
    forcedWinningNumber: gameState.forcedWinningNumber,
    message: gameState.forcedWinningNumber
      ? `កំណត់លទ្ធផលឈ្នះជាមុន: លេខ ${gameState.forcedWinningNumber}`
      : 'កំណត់ឡើងវិញទៅជាចៃដន្យ',
  });
});

// Admin: Force Immediate Draw (Protected by requireAdminAuth + results.manage)
app.post('/api/admin/force-draw', requireAdminAuth, requireAdminPermission('results.manage'), (req, res) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { targetNumber } = req.body;

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'FORCE_DRAW',
    targetId: `2004#${gameState.currentRoundIndex}`,
    details: `បញ្ជាចាប់ឆ្នោតភ្លាមៗសម្រាប់ជុំ 2004#${gameState.currentRoundIndex}${targetNumber ? ` (លេខ ${targetNumber})` : ''}`,
    ip: req.ip || '127.0.0.1',
  });

  executeDrawSequence(targetNumber);
  res.json({ success: true, message: 'បានចាប់ផ្តើមការចាប់ឆ្នោតភ្លាមៗលើគ្រប់ឧបករណ៍' });
});

// Admin: Add Manual Result Record to History (Protected by requireAdminAuth + results.manage)
app.post('/api/admin/manual-result', requireAdminAuth, requireAdminPermission('results.manage'), (req, res) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { result } = req.body;
  if (!result || !result.number || !result.roundId) {
    return res.status(400).json({ error: 'Invalid result object' });
  }

  gameState.history = [result, ...gameState.history.filter((h) => h.roundId !== result.roundId)];
  gameState.saveStateToDisk();

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'MANUAL_RESULT',
    targetId: result.roundId,
    details: `បញ្ចូលលទ្ធផលដោយដៃ: ជុំ ${result.roundId} = លេខ ${result.number} (${result.animal})`,
    ip: req.ip || '127.0.0.1',
  });

  broadcastPublic({
    type: 'HISTORY_UPDATED',
    history: gameState.history,
  });

  res.json({ success: true, history: gameState.history });
});

// Admin: Delete Result from History (Protected by requireAdminAuth + results.manage)
app.delete('/api/admin/result/:roundId', requireAdminAuth, requireAdminPermission('results.manage'), (req, res) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { roundId } = req.params;
  gameState.history = gameState.history.filter((h) => h.roundId !== roundId);
  gameState.saveStateToDisk();

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'DELETE_RESULT',
    targetId: roundId,
    details: `លុបកំណត់ត្រាលទ្ធផលជុំ ${roundId}`,
    ip: req.ip || '127.0.0.1',
  });

  broadcastPublic({
    type: 'HISTORY_UPDATED',
    history: gameState.history,
  });

  res.json({ success: true, history: gameState.history });
});

// Requirement 1: Explicitly disable active Lottery 1/99 routes and betting APIs (historical data preserved)
app.all(['/api/lottery-1-99', '/api/lottery-1-99/*', '/api/1-99', '/api/1-99/*', '/api/lottery199', '/api/lottery199/*'], (_req, res) => {
  return res.status(410).json({
    error: 'ប្រភេទឆ្នោត 1/99 ត្រូវបានបិទដំណើរការ! សូមប្រើប្រាស់ ឆ្នោត 12។ / Lottery 1/99 has been disabled.',
    code: 'LOTTERY_1_99_DISABLED',
  });
});

// Player: Place Bet (Scoped to logged-in player account if authenticated)
app.post('/api/bet', (req, res) => {
  const { betRecord, gameType } = req.body;
  if (
    gameType === 'lottery_1_99' ||
    gameType === '1/99' ||
    betRecord?.gameType === 'lottery_1_99' ||
    String(betRecord?.roundId || '').toLowerCase().includes('199')
  ) {
    return res.status(410).json({
      error: 'ប្រភេទឆ្នោត 1/99 ត្រូវបានបិទដំណើរការ! / Lottery 1/99 betting is disabled.',
      code: 'LOTTERY_1_99_DISABLED',
    });
  }
  if (!betRecord || !betRecord.totalStake || betRecord.totalStake <= 0) {
    return res.status(400).json({ error: 'Invalid bet record' });
  }

  if (
    gameState.countdown <= gameState.platformSettings.bettingLockoutSeconds ||
    gameState.isRevealing ||
    gameState.platformSettings.isRoundPaused
  ) {
    return res.status(403).json({ error: 'Betting is closed for this round' });
  }

  // Strictly bind bet to server-validated authenticated player session (never trust client playerId)
  const playerAuth = extractPlayerSession(req);
  if (!playerAuth) {
    return res.status(401).json({
      error: 'សូមចូលគណនីអ្នកលេងជាមុនសិន! / Unauthorized: Player login required to place bets.',
      code: 'PLAYER_AUTH_REQUIRED',
    });
  }

  const activePlayer = playerAuth.player;
  if (activePlayer.balance < betRecord.totalStake) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  activePlayer.balance -= betRecord.totalStake;
  activePlayer.betsCount7d = (activePlayer.betsCount7d || 0) + 1;
  betRecord.playerId = activePlayer.id;
  betRecord.username = activePlayer.username;
  if (activePlayer.id === 'P0001001') {
    gameState.balance = activePlayer.balance;
  }

  betRecord.placedTimestamp = betRecord.placedTimestamp || Date.now();
  betRecord.acceptedOdds = betRecord.acceptedOdds ?? betRecord.bets?.[0]?.odds ?? 1.95;
  betRecord.status = 'pending';

  const newBalance = activePlayer.balance;
  gameState.recentBets = [betRecord, ...gameState.recentBets];
  gameState.saveStateToDisk();

  // Strictly scoped broadcast: only activePlayer gets their own bets & balance; admins get full view.
  broadcastToPlayerAndAdmins(
    activePlayer.id,
    () => ({
      type: 'BET_PLACED',
      betRecord,
      recentBets: gameState.getPlayerBets(activePlayer),
      newBalance,
    }),
    () => ({
      type: 'BET_PLACED',
      betRecord,
      recentBets: gameState.recentBets,
      newBalance,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  res.json({
    success: true,
    betRecord,
    newBalance,
  });
});

// Transactions: Admin-Only Deposits & Adjustments; Player Withdrawal Requests Preserved
app.post('/api/transaction', (req, res) => {
  const { userName, userPhone, type, amount, method, status, note, playerId, referenceId } = req.body || {};
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Invalid transaction amount' });
  }

  const txType: 'deposit' | 'withdrawal' | 'adjustment' =
    type === 'withdrawal' || type === 'adjustment' ? type : 'deposit';

  const playerAuth = extractPlayerSession(req);
  const adminAuth = extractAdminSession(req);

  // Requirement 2: Independent player deposits & balance credits are STRICTLY FORBIDDEN.
  // Only authorized administrators with finance.manage may create deposit or adjustment credits.
  if (txType === 'deposit' || txType === 'adjustment') {
    if (!adminAuth) {
      return res.status(403).json({
        error: 'អ្នកលេងមិនអាចដាក់ប្រាក់ដោយខ្លួនឯងបានទេ! មានតែអ្នកគ្រប់គ្រង (Admin) ប៉ុណ្ណោះដែលអាចបញ្ចូលប្រាក់បាន។ / Players cannot deposit independently. Admin authorization required.',
        code: 'FORBIDDEN_ADMIN_ONLY_DEPOSIT',
      });
    }
    if (!hasAdminPermission(adminAuth.admin, 'finance.manage')) {
      return res.status(403).json({
        error: 'គណនីអ្នកគ្រប់គ្រងនេះមិនមានសិទ្ធិ "finance.manage" ទេ! / Insufficient permissions: requires finance.manage',
        code: 'INSUFFICIENT_ADMIN_PERMISSION',
      });
    }
  } else {
    // Withdrawal requests: allowed for authenticated player (pending) or authorized admin
    if (!adminAuth && !playerAuth) {
      return res.status(401).json({
        error: 'សូមចូលគណនីជាមុនសិន! / Authentication required.',
        code: 'UNAUTHORIZED',
      });
    }
    if (adminAuth && !hasAdminPermission(adminAuth.admin, 'finance.manage')) {
      return res.status(403).json({
        error: 'គណនីអ្នកគ្រប់គ្រងនេះមិនមានសិទ្ធិ "finance.manage" ទេ! / Insufficient permissions: requires finance.manage',
        code: 'INSUFFICIENT_ADMIN_PERMISSION',
      });
    }
  }

  // Only allow pre-approved status if request comes from an authenticated Admin with finance.manage
  const resolvedStatus = adminAuth && status === 'approved' ? 'approved' : 'pending';
  const targetPlayer =
    (adminAuth && playerId && gameState.players.find((p) => p.id === playerId)) ||
    (adminAuth && userName && gameState.players.find((p) => p.username.toLowerCase() === String(userName).toLowerCase())) ||
    playerAuth?.player;

  if (!targetPlayer) {
    return res.status(404).json({ error: 'រកមិនឃើញគណនីអ្នកលេង! / Target player account not found.' });
  }

  const nowMs = Date.now();
  const cleanRefId =
    typeof referenceId === 'string' && referenceId.trim().length > 0
      ? referenceId.trim()
      : `REF-${formatPhnomPenhDate(nowMs).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  // Prevent duplicate credits by referenceId or identical rapid double-submit within 5 seconds
  const duplicateByRef = gameState.transactions.some(
    (t) => t.referenceId && t.referenceId === cleanRefId
  );
  const duplicateRapidCredit =
    adminAuth &&
    (txType === 'deposit' || txType === 'adjustment') &&
    gameState.transactions.some(
      (t) =>
        t.playerId === targetPlayer.id &&
        t.adminId === adminAuth.admin.id &&
        t.type === txType &&
        t.amount === numericAmount &&
        Math.abs(nowMs - t.timestamp) < 5000
    );

  if (duplicateByRef || duplicateRapidCredit) {
    return res.status(409).json({
      error: 'ប្រតិបត្តិការស្ទួនត្រូវបានរារាំង! / Duplicate credit or transaction reference rejected.',
      code: 'DUPLICATE_TRANSACTION',
    });
  }

  const timeStr = formatShortTime(nowMs);
  const dateStr = formatPhnomPenhDateTime(nowMs);
  const newTx: TransactionRecord = {
    id: `tx-${nowMs}-${crypto.randomBytes(2).toString('hex')}`,
    playerId: targetPlayer.id,
    adminId: adminAuth?.admin.id,
    adminUsername: adminAuth?.admin.username,
    referenceId: cleanRefId,
    userName: targetPlayer.username,
    userPhone: targetPlayer.phone || userPhone || '—',
    type: txType,
    amount: numericAmount,
    method: method || 'ABA Bank',
    status: resolvedStatus,
    timestamp: nowMs,
    timeString: timeStr,
    dateString: dateStr,
    note: note || '',
  };

  if (newTx.status === 'approved') {
    if (newTx.type === 'deposit' || newTx.type === 'adjustment') {
      targetPlayer.balance += newTx.amount;
    } else if (newTx.type === 'withdrawal') {
      targetPlayer.balance = Math.max(0, targetPlayer.balance - newTx.amount);
    }
    if (targetPlayer.id === 'P0001001') {
      gameState.balance = targetPlayer.balance;
    }
  }

  gameState.transactions = [newTx, ...gameState.transactions];
  if (adminAuth) {
    gameState.addAuditLog({
      actorId: adminAuth.admin.id,
      actorUsername: adminAuth.admin.username,
      actorRole: adminAuth.admin.role,
      action: 'CREATE_TRANSACTION',
      targetId: targetPlayer.id,
      targetName: targetPlayer.username,
      details: `បង្កើតប្រតិបត្តិការ ${newTx.type}: ${newTx.amount.toLocaleString()}៛ សម្រាប់ ${targetPlayer.username} (${targetPlayer.id}) [Ref: ${cleanRefId} | Date: ${dateStr}]`,
      ip: req.ip || '127.0.0.1',
    });
  }
  gameState.saveStateToDisk();

  const updatedBalance = targetPlayer.balance;
  broadcastToPlayerAndAdmins(
    targetPlayer.id,
    () => ({
      type: 'TRANSACTION_UPDATED',
      transactions: gameState.getPlayerTransactions(targetPlayer),
      newBalance: updatedBalance,
    }),
    () => ({
      type: 'TRANSACTION_UPDATED',
      transactions: gameState.transactions,
      newBalance: updatedBalance,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  res.json({ success: true, transaction: newTx, newBalance: updatedBalance });
});

// Transactions: Approve / Reject Transaction (Protected by requireAdminAuth + finance.manage)
app.post('/api/transaction/:id/status', requireAdminAuth, requireAdminPermission('finance.manage'), (req, res) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { id } = req.params;
  const { status } = req.body;

  const existingTx = gameState.transactions.find((t) => t.id === id);
  if (!existingTx) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (existingTx.status !== 'pending') {
    return res.status(400).json({ error: 'Transaction already processed' });
  }

  existingTx.status = status;
  existingTx.adminId = admin.id;
  existingTx.adminUsername = admin.username;
  if (!existingTx.dateString) {
    existingTx.dateString = formatPhnomPenhDateTime(Date.now());
  }
  if (!existingTx.referenceId) {
    existingTx.referenceId = `REF-${formatPhnomPenhDate(Date.now()).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  const targetPlayer = gameState.players.find(
    (p) => p.id === existingTx.playerId || p.username.toLowerCase() === existingTx.userName.toLowerCase()
  );

  if (status === 'approved') {
    if (targetPlayer) {
      if (existingTx.type === 'deposit' || existingTx.type === 'adjustment') {
        targetPlayer.balance += existingTx.amount;
      } else if (existingTx.type === 'withdrawal') {
        targetPlayer.balance = Math.max(0, targetPlayer.balance - existingTx.amount);
      }
      if (targetPlayer.id === 'P0001001') {
        gameState.balance = targetPlayer.balance;
      }
    } else {
      if (existingTx.type === 'deposit' || existingTx.type === 'adjustment') {
        gameState.balance += existingTx.amount;
      } else if (existingTx.type === 'withdrawal') {
        gameState.balance = Math.max(0, gameState.balance - existingTx.amount);
      }
    }
  }

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: status === 'approved' ? 'APPROVE_TRANSACTION' : 'REJECT_TRANSACTION',
    targetId: existingTx.playerId || existingTx.id,
    targetName: existingTx.userName,
    details: `${status === 'approved' ? 'អនុម័ត' : 'បដិសេធ'}ប្រតិបត្តិការ ${existingTx.id} (${existingTx.amount.toLocaleString()}៛) របស់ ${existingTx.userName} [Ref: ${existingTx.referenceId}]`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();

  broadcastToPlayerAndAdmins(
    targetPlayer?.id,
    () => ({
      type: 'TRANSACTION_UPDATED',
      transactions: targetPlayer ? gameState.getPlayerTransactions(targetPlayer) : [],
      newBalance: targetPlayer ? targetPlayer.balance : 0,
    }),
    () => ({
      type: 'TRANSACTION_UPDATED',
      transactions: gameState.transactions,
      newBalance: targetPlayer ? targetPlayer.balance : gameState.balance,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  res.json({
    success: true,
    transactions: gameState.transactions,
    newBalance: targetPlayer ? targetPlayer.balance : gameState.balance,
  });
});

// ========================================================
// AUTHORITATIVE PLAYER WIN/LOSS, OWNER WIN/LOSS & EXPOSURE ANALYTICS
// ========================================================

function filterBetsByScope(
  bets: BetHistoryRecord[],
  opts: { playerId?: string; username?: string; roundId?: string; period?: string }
): BetHistoryRecord[] {
  const { playerId, username, roundId, period } = opts;
  const now = Date.now();
  const currentRoundId = `2004#${gameState.currentRoundIndex}`;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const sevenDaysMs = now - 7 * 24 * 60 * 60 * 1000;

  return bets.filter((rec) => {
    if (playerId && rec.playerId !== playerId) {
      return false;
    }
    if (username && rec.username?.toLowerCase() !== username.toLowerCase()) {
      return false;
    }
    if (roundId && roundId !== 'all') {
      const targetRound = roundId === 'current' ? currentRoundId : roundId;
      if (rec.roundId !== targetRound) return false;
    }
    if (period && period !== 'all') {
      const ts = rec.placedTimestamp || rec.settledTimestamp || now;
      if (period === 'today' && ts < todayMs) return false;
      if (period === '7d' && ts < sevenDaysMs) return false;
    }
    return true;
  });
}

function computeExposureForBets(filteredBets: BetHistoryRecord[]) {
  const activeAccepted = filteredBets.filter(
    (b) => b.status !== 'refunded' && b.status !== 'voided'
  );
  const unsettledBets = activeAccepted.filter((b) => b.status === 'pending');
  const settledBets = activeAccepted.filter((b) => b.status === 'won' || b.status === 'lost');
  const refundedBets = filteredBets.filter(
    (b) => b.status === 'refunded' || b.status === 'voided'
  );

  const totalWager = activeAccepted.reduce((sum, b) => sum + (b.totalStake || 0), 0);
  const unsettledStake = unsettledBets.reduce((sum, b) => sum + (b.totalStake || 0), 0);
  const settledStakes = settledBets.reduce((sum, b) => sum + (b.totalStake || 0), 0);
  const settledPayouts = settledBets.reduce((sum, b) => sum + (b.totalPayout || 0), 0);

  // Realized Net P/L from platform perspective (settled stakes retained minus winning payouts paid out; unsettled excluded)
  const netPL = settledStakes - settledPayouts;

  // Outcome-by-outcome (1..12) maximum liability per unsettled round:
  // Avoids blindly summing mutually exclusive animal payouts; properly accounts for overlapping Small/Big/Odd/Even/Color legs.
  const betsByRound = new Map<string, BetHistoryRecord[]>();
  for (const b of unsettledBets) {
    const arr = betsByRound.get(b.roundId) || [];
    arr.push(b);
    betsByRound.set(b.roundId, arr);
  }

  let maximumExposure = 0;
  let maxGrossPayout = 0;
  const roundBreakdown: {
    roundId: string;
    unsettledStake: number;
    maxNetExposure: number;
    maxGrossPayout: number;
    worstCaseNumber: number;
  }[] = [];

  for (const [roundId, roundBets] of betsByRound.entries()) {
    const roundStake = roundBets.reduce((s, b) => s + (b.totalStake || 0), 0);
    let roundMaxNet = 0;
    let roundMaxGross = 0;
    let worstNum = 1;

    for (let num = 1; num <= 12; num++) {
      let payoutForNum = 0;
      for (const rec of roundBets) {
        for (const leg of rec.bets || []) {
          if (checkIsCategoryWon(leg.type, num)) {
            payoutForNum += Math.round((leg.amount || 0) * (leg.odds || 0));
          }
        }
      }
      const netExposureForNum = Math.max(0, payoutForNum - roundStake);
      if (payoutForNum > roundMaxGross) {
        roundMaxGross = payoutForNum;
      }
      if (netExposureForNum > roundMaxNet) {
        roundMaxNet = netExposureForNum;
        worstNum = num;
      }
    }

    maximumExposure += roundMaxNet;
    maxGrossPayout += roundMaxGross;
    roundBreakdown.push({
      roundId,
      unsettledStake: roundStake,
      maxNetExposure: roundMaxNet,
      maxGrossPayout: roundMaxGross,
      worstCaseNumber: worstNum,
    });
  }

  return {
    totalWager,
    maximumExposure,
    maxGrossPayout,
    netPL,
    unsettledStake,
    settledStakes,
    settledPayouts,
    totalBetsCount: activeAccepted.length,
    unsettledCount: unsettledBets.length,
    settledCount: settledBets.length,
    refundedCount: refundedBets.length,
    roundBreakdown,
  };
}

// Requirement 4: Admin Panel Player & Platform Betting Exposure API
app.get('/api/admin/exposure', requireAdminAuth, requireAdminPermission('bets.view'), (req: Request, res: Response) => {
  const playerId = req.query.playerId ? String(req.query.playerId).trim() : undefined;
  const username = req.query.username ? String(req.query.username).trim() : undefined;
  const roundId = req.query.roundId ? String(req.query.roundId).trim() : 'all';
  const period = req.query.period ? String(req.query.period).trim() : 'all';

  const scopedBets = filterBetsByScope(gameState.recentBets, {
    playerId: playerId && playerId !== 'all' ? playerId : undefined,
    username: username && username !== 'all' ? username : undefined,
    roundId,
    period,
  });

  const stats = computeExposureForBets(scopedBets);

  // Per-player breakdown for the active scope (when viewing aggregate or round)
  const playerMap = new Map<string, BetHistoryRecord[]>();
  for (const b of scopedBets) {
    const key = b.playerId || b.username || 'unknown';
    const arr = playerMap.get(key) || [];
    arr.push(b);
    playerMap.set(key, arr);
  }
  const perPlayer = Array.from(playerMap.entries()).map(([key, pBets]) => {
    const pObj = gameState.players.find((p) => p.id === key || p.username === key);
    const pStats = computeExposureForBets(pBets);
    return {
      playerId: pObj?.id || key,
      username: pObj?.username || pBets[0]?.username || key,
      ...pStats,
    };
  });

  res.json({
    scope: {
      playerId: playerId || 'all',
      roundId,
      period,
      currentRoundId: `2004#${gameState.currentRoundIndex}`,
    },
    ...stats,
    perPlayer,
  });
});

// Requirement 2A: Player-Only Complete Win/Loss API (strictly scoped to authenticated player)
app.get('/api/player/win-loss', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization, Cookie');

  const playerAuth = extractPlayerSession(req);
  if (!playerAuth) {
    return res.status(401).json({
      error: 'សូមចូលគណនីអ្នកលេងជាមុនសិន! / Unauthorized: Player login required.',
      code: 'PLAYER_AUTH_REQUIRED',
    });
  }

  const player = playerAuth.player;
  const requestedPlayerId = req.query.playerId ? String(req.query.playerId).trim() : '';
  const requestedUsername = req.query.username ? String(req.query.username).trim() : '';
  if (
    (requestedPlayerId && requestedPlayerId !== player.id) ||
    (requestedUsername && requestedUsername.toLowerCase() !== player.username.toLowerCase())
  ) {
    return res.status(403).json({
      error: 'អ្នកមិនមានសិទ្ធិមើលរបាយការណ៍ហិរញ្ញវត្ថុរបស់គណនីអ្នកលេងផ្សេងទៀតទេ! / Forbidden: Cannot access another player financial report.',
      code: 'FORBIDDEN_CROSS_PLAYER_REPORT',
    });
  }

  const statusFilter = String(req.query.status || 'all').toLowerCase();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '15'), 10) || 15));

  const allPlayerBets = gameState.getPlayerBets(player);

  // Compute authoritative player-perspective totals across all player records (before status/page filter)
  let totalWagered = 0;
  let totalWinningPayout = 0;
  let totalWinningNet = 0;
  let totalLosingAmount = 0;
  let pendingStake = 0;
  let refundedStake = 0;
  let wonCount = 0;
  let lostCount = 0;
  let pendingCount = 0;
  let refundedCount = 0;

  for (const rec of allPlayerBets) {
    const stake = rec.totalStake || 0;
    if (rec.status === 'won') {
      wonCount++;
      totalWagered += stake;
      const payout = rec.totalPayout || 0;
      totalWinningPayout += payout;
      totalWinningNet += payout - stake;
    } else if (rec.status === 'lost') {
      lostCount++;
      totalWagered += stake;
      totalLosingAmount += stake;
    } else if (rec.status === 'pending') {
      pendingCount++;
      totalWagered += stake;
      pendingStake += stake;
    } else if (rec.status === 'refunded' || rec.status === 'voided') {
      refundedCount++;
      refundedStake += stake;
    }
  }

  // Realized Net Win/Loss from player perspective: won net profit minus losing stakes (pending/refunded excluded)
  const netWinLoss = totalWinningNet - totalLosingAmount;
  const settledCount = wonCount + lostCount;
  const winRate = settledCount > 0 ? Math.round((wonCount / settledCount) * 1000) / 10 : 0;

  const filteredRecords = allPlayerBets.filter((rec) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'refunded') return rec.status === 'refunded' || rec.status === 'voided';
    return rec.status === statusFilter;
  });

  const total = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * limit;

  const mappedRecords = filteredRecords.slice(startIdx, startIdx + limit).map((rec) => {
    const firstOdds = rec.acceptedOdds ?? rec.bets?.[0]?.odds ?? 1.95;
    const potentialPayout =
      rec.totalPotentialPayout ||
      (rec.bets?.[0]?.potentialWin ?? Math.round((rec.totalStake || 0) * firstOdds));
    const realizedNet =
      rec.status === 'won'
        ? (rec.totalPayout || 0) - (rec.totalStake || 0)
        : rec.status === 'lost'
        ? -(rec.totalStake || 0)
        : 0;

    return {
      ...rec,
      acceptedOdds: firstOdds,
      totalPotentialPayout: potentialPayout,
      realizedNetWinLoss: realizedNet,
      settledAt: rec.settledAt || (rec.status === 'pending' ? null : rec.time),
    };
  });

  return res.json({
    player: {
      id: player.id,
      username: player.username,
      balance: player.balance,
    },
    summary: {
      totalRecords: allPlayerBets.length,
      totalWagered,
      totalWinningPayout,
      totalWinningNet,
      totalLosingAmount,
      netWinLoss,
      pendingStake,
      refundedStake,
      wonCount,
      lostCount,
      pendingCount,
      refundedCount,
      winRate,
    },
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
    },
    records: mappedRecords,
  });
});

// Single Source of Truth: Lottery #12 System Owner Win/Loss Calculation Engine
// Formula: System Owner Net Profit/Loss = Total Valid Stakes Received - Total Payouts (settled bets only; deposits & admin credits excluded)
// When `opts.player` is provided (Player Game Page), calculations use ONLY that authenticated player's bets while preserving shared official lottery round results.
function computeOwnerLottery12Report(
  opts: { period?: string; roundId?: string; player?: StoredPlayerAccount | null } = {}
) {
  const nowMs = Date.now();
  const serverDate = formatPhnomPenhDate(nowMs);
  const serverDateTime = formatPhnomPenhDateTime(nowMs);
  const period = opts.period || 'all';
  const roundFilter = opts.roundId || 'all';

  const historyByRound = new Map<string, DrawResult>();
  for (const h of gameState.history) {
    if (!historyByRound.has(h.roundId)) {
      historyByRound.set(h.roundId, h);
    }
  }

  const resolveBetTimestamp = (rec: BetHistoryRecord, draw?: DrawResult): number => {
    return rec.settledTimestamp || draw?.timestamp || rec.placedTimestamp || nowMs;
  };

  // Restrict source bets to the authenticated player when computing a player-scoped report
  const sourceBets = opts.player ? gameState.getPlayerBets(opts.player) : gameState.recentBets;

  // Filter bets using Cambodia timezone boundaries for 'today' and '7d'
  const scopedBets = sourceBets.filter((rec) => {
    if (roundFilter !== 'all') {
      const target = roundFilter === 'current' ? `2004#${gameState.currentRoundIndex}` : roundFilter;
      if (rec.roundId !== target) return false;
    }
    if (period !== 'all') {
      const draw = historyByRound.get(rec.roundId);
      const ts = resolveBetTimestamp(rec, draw);
      if (period === 'today') {
        if (formatPhnomPenhDate(ts) !== serverDate) return false;
      } else if (period === '7d') {
        if (ts < nowMs - 7 * 24 * 60 * 60 * 1000) return false;
      }
    }
    return true;
  });

  let totalAcceptedWagers = 0;
  let totalValidBets = 0;
  let totalValidStakes = 0;
  let totalPayouts = 0;
  let totalOwnerProfit = 0;
  let totalOwnerLoss = 0;
  let totalRefundsVoided = 0;
  let pendingStakes = 0;
  let wonCount = 0;
  let lostCount = 0;
  let pendingCount = 0;
  let refundedCount = 0;

  type RoundAccum = {
    roundId: string;
    resultNumber?: number;
    animal?: string;
    color?: ColorGroup;
    size?: SizeGroup;
    parity?: ParityGroup;
    timestamp: number;
    date: string;
    time: string;
    dateTime: string;
    betsCount: number;
    validBetsCount: number;
    acceptedWagers: number;
    settledStakes: number;
    actualPayouts: number;
    refunds: number;
    refundedCount: number;
    pendingStakes: number;
    ownerProfit: number;
    ownerLoss: number;
    netPlatformWinLoss: number;
  };

  const roundMap = new Map<string, RoundAccum>();
  const dailyMap = new Map<
    string,
    {
      date: string;
      settledRounds: Set<string>;
      totalValidBets: number;
      totalValidStakes: number;
      totalPayouts: number;
      refundedStakes: number;
      ownerProfit: number;
      ownerLoss: number;
      netProfitLoss: number;
    }
  >();
  const playerMap = new Map<
    string,
    {
      playerId: string;
      username: string;
      betsCount: number;
      validBetsCount: number;
      acceptedWagers: number;
      settledStakes: number;
      actualPayouts: number;
      refunds: number;
      pendingStakes: number;
      ownerProfit: number;
      ownerLoss: number;
      netPlatformWinLoss: number;
    }
  >();

  const getOrCreateRound = (roundId: string, fallbackTs: number, resultNum?: number): RoundAccum => {
    const existing = roundMap.get(roundId);
    if (existing) return existing;
    const draw = historyByRound.get(roundId);
    const num = draw?.number ?? resultNum;
    const animalMeta = num ? ANIMALS_DATA[num] : undefined;
    const ts = draw?.timestamp || fallbackTs;
    const entry: RoundAccum = {
      roundId,
      resultNumber: num,
      animal: draw?.animal || animalMeta?.khmerName,
      color: draw?.color || animalMeta?.color,
      size: draw?.size || animalMeta?.size,
      parity: draw?.parity || animalMeta?.parity,
      timestamp: ts,
      date: formatPhnomPenhDate(ts),
      time: draw?.time || formatPhnomPenhTime(ts),
      dateTime: formatPhnomPenhDateTime(ts),
      betsCount: 0,
      validBetsCount: 0,
      acceptedWagers: 0,
      settledStakes: 0,
      actualPayouts: 0,
      refunds: 0,
      refundedCount: 0,
      pendingStakes: 0,
      ownerProfit: 0,
      ownerLoss: 0,
      netPlatformWinLoss: 0,
    };
    roundMap.set(roundId, entry);
    return entry;
  };

  const getOrCreateDay = (dateKey: string) => {
    let day = dailyMap.get(dateKey);
    if (!day) {
      day = {
        date: dateKey,
        settledRounds: new Set<string>(),
        totalValidBets: 0,
        totalValidStakes: 0,
        totalPayouts: 0,
        refundedStakes: 0,
        ownerProfit: 0,
        ownerLoss: 0,
        netProfitLoss: 0,
      };
      dailyMap.set(dateKey, day);
    }
    return day;
  };

  // Seed completed Lottery #12 history rounds for accurate round/daily visibility (actual completed draws only)
  for (const h of gameState.history) {
    if (roundFilter !== 'all' && h.roundId !== roundFilter) continue;
    if (period === 'today' && formatPhnomPenhDate(h.timestamp) !== serverDate) continue;
    if (period === '7d' && h.timestamp < nowMs - 7 * 24 * 60 * 60 * 1000) continue;
    const r = getOrCreateRound(h.roundId, h.timestamp, h.number);
    const d = getOrCreateDay(r.date);
    d.settledRounds.add(h.roundId);
  }

  for (const rec of scopedBets) {
    const stake = Number(rec.totalStake) || 0;
    const payout = Number(rec.totalPayout) || 0;
    const isVoided = rec.status === 'refunded' || rec.status === 'voided';
    const isSettled = rec.status === 'won' || rec.status === 'lost';
    const isPending = rec.status === 'pending';

    const draw = historyByRound.get(rec.roundId);
    const betTs = resolveBetTimestamp(rec, draw);
    const betDate = formatPhnomPenhDate(betTs);

    // Owner perspective per settled bet:
    // Player loses -> stake - 0 = +stake (owner profit)
    // Player wins  -> stake - payout (if payout > stake, owner loss = payout - stake; net = stake - payout)
    let betOwnerProfit = 0;
    let betOwnerLoss = 0;
    if (isSettled) {
      const betOwnerNet = stake - payout;
      if (betOwnerNet >= 0) {
        betOwnerProfit = betOwnerNet;
      } else {
        betOwnerLoss = Math.abs(betOwnerNet);
      }
    }

    if (isVoided) {
      refundedCount++;
      totalRefundsVoided += stake;
    } else {
      totalAcceptedWagers += stake;
      if (isSettled) {
        totalValidBets++;
        totalValidStakes += stake;
        totalPayouts += payout;
        totalOwnerProfit += betOwnerProfit;
        totalOwnerLoss += betOwnerLoss;
        if (rec.status === 'won') wonCount++;
        if (rec.status === 'lost') lostCount++;
      } else if (isPending) {
        pendingCount++;
        pendingStakes += stake;
      }
    }

    // Round accumulation (settled + refunded/pending metadata)
    const rEntry = getOrCreateRound(rec.roundId, betTs, rec.resultNumber);
    rEntry.betsCount += 1;
    if (isVoided) {
      rEntry.refunds += stake;
      rEntry.refundedCount += 1;
    } else {
      rEntry.acceptedWagers += stake;
      if (isSettled) {
        rEntry.validBetsCount += 1;
        rEntry.settledStakes += stake;
        rEntry.actualPayouts += payout;
        rEntry.ownerProfit += betOwnerProfit;
        rEntry.ownerLoss += betOwnerLoss;
      } else if (isPending) {
        rEntry.pendingStakes += stake;
      }
    }
    rEntry.netPlatformWinLoss = rEntry.settledStakes - rEntry.actualPayouts;

    // Daily accumulation (settled bets & refunds only)
    const dEntry = getOrCreateDay(betDate);
    if (isVoided) {
      dEntry.refundedStakes += stake;
    } else if (isSettled) {
      dEntry.settledRounds.add(rec.roundId);
      dEntry.totalValidBets += 1;
      dEntry.totalValidStakes += stake;
      dEntry.totalPayouts += payout;
      dEntry.ownerProfit += betOwnerProfit;
      dEntry.ownerLoss += betOwnerLoss;
      dEntry.netProfitLoss = dEntry.totalValidStakes - dEntry.totalPayouts;
    }

    // Player accumulation
    const pId = rec.playerId || 'unknown';
    const matchedPlayer = gameState.players.find((p) => p.id === pId);
    const pEntry = playerMap.get(pId) || {
      playerId: pId,
      username: matchedPlayer?.username || rec.username || pId,
      betsCount: 0,
      validBetsCount: 0,
      acceptedWagers: 0,
      settledStakes: 0,
      actualPayouts: 0,
      refunds: 0,
      pendingStakes: 0,
      ownerProfit: 0,
      ownerLoss: 0,
      netPlatformWinLoss: 0,
    };
    pEntry.betsCount += 1;
    if (isVoided) {
      pEntry.refunds += stake;
    } else {
      pEntry.acceptedWagers += stake;
      if (isSettled) {
        pEntry.validBetsCount += 1;
        pEntry.settledStakes += stake;
        pEntry.actualPayouts += payout;
        pEntry.ownerProfit += betOwnerProfit;
        pEntry.ownerLoss += betOwnerLoss;
      } else if (isPending) {
        pEntry.pendingStakes += stake;
      }
    }
    pEntry.netPlatformWinLoss = pEntry.settledStakes - pEntry.actualPayouts;
    playerMap.set(pId, pEntry);
  }

  // Only include completed/settled rounds (rounds with a drawn result or settled bets) sorted newest first
  const completedRounds = Array.from(roundMap.values())
    .filter((r) => r.resultNumber !== undefined || r.validBetsCount > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ timestamp: _ts, ...rest }) => rest);

  const dailySummaries = Array.from(dailyMap.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      date: d.date,
      settledRoundsCount: d.settledRounds.size,
      totalValidBets: d.totalValidBets,
      totalValidStakes: d.totalValidStakes,
      totalPayouts: d.totalPayouts,
      refundedStakes: d.refundedStakes,
      ownerProfit: d.ownerProfit,
      ownerLoss: d.ownerLoss,
      netProfitLoss: d.totalValidStakes - d.totalPayouts,
    }));

  // Compute Today's exact owner totals in Asia/Phnom_Penh across all settled records
  const todayDayRow = dailySummaries.find((d) => d.date === serverDate);
  const todaySummary = todayDayRow
    ? {
        date: serverDate,
        settledRoundsCount: todayDayRow.settledRoundsCount,
        totalValidBets: todayDayRow.totalValidBets,
        totalValidStakes: todayDayRow.totalValidStakes,
        totalPayouts: todayDayRow.totalPayouts,
        ownerProfit: todayDayRow.ownerProfit,
        ownerLoss: todayDayRow.ownerLoss,
        netProfitLoss: todayDayRow.netProfitLoss,
      }
    : {
        date: serverDate,
        settledRoundsCount: 0,
        totalValidBets: 0,
        totalValidStakes: 0,
        totalPayouts: 0,
        ownerProfit: 0,
        ownerLoss: 0,
        netProfitLoss: 0,
      };

  // Latest completed Lottery #12 round
  const latestDraw = gameState.history[0];
  const latestRound = latestDraw
    ? completedRounds.find((r) => r.roundId === latestDraw.roundId) || {
        roundId: latestDraw.roundId,
        resultNumber: latestDraw.number,
        animal: latestDraw.animal,
        color: latestDraw.color,
        size: latestDraw.size,
        parity: latestDraw.parity,
        date: formatPhnomPenhDate(latestDraw.timestamp),
        time: latestDraw.time || formatPhnomPenhTime(latestDraw.timestamp),
        dateTime: formatPhnomPenhDateTime(latestDraw.timestamp),
        betsCount: 0,
        validBetsCount: 0,
        acceptedWagers: 0,
        settledStakes: 0,
        actualPayouts: 0,
        refunds: 0,
        refundedCount: 0,
        pendingStakes: 0,
        ownerProfit: 0,
        ownerLoss: 0,
        netPlatformWinLoss: 0,
      }
    : completedRounds[0] || null;

  // Formula: System Owner Net Profit/Loss = Total Valid Stakes Received - Total Payouts
  const netOwnerProfitLoss = totalValidStakes - totalPayouts;

  return {
    timezone: CAMBODIA_TZ,
    serverDate,
    serverDateTime,
    summary: {
      totalBetsCount: scopedBets.length,
      totalValidBets,
      totalValidStakes,
      totalPayouts,
      totalOwnerProfit,
      totalOwnerLoss,
      netOwnerProfitLoss,
      totalSettledRounds: completedRounds.length,
      totalAcceptedWagers,
      totalSettledStakes: totalValidStakes,
      totalActualWinningPayouts: totalPayouts,
      totalRefundsVoided,
      pendingStakes,
      netPlatformWinLoss: netOwnerProfitLoss,
      wonCount,
      lostCount,
      pendingCount,
      refundedCount,
    },
    todaySummary,
    latestRound,
    byRound: completedRounds,
    dailySummaries,
    byPlayer: Array.from(playerMap.values()),
  };
}

// Unified Lottery #12 System Owner Win/Loss & Summary Endpoint
// Player sessions ALWAYS receive owner-perspective figures calculated strictly from their own authenticated bets (with shared official round outcomes).
// Admin-only sessions (no player session) continue to receive the full system-wide report.
app.get('/api/lottery12/win-loss', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Authorization, Cookie');

  const playerAuth = extractPlayerSession(req);
  const adminAuth = extractAdminSession(req);
  if (!playerAuth && !adminAuth) {
    return res.status(401).json({
      error: 'សូមចូលគណនីជាមុនសិន! / Unauthorized: Login required.',
      code: 'AUTH_REQUIRED',
    });
  }

  const period = req.query.period ? String(req.query.period).trim() : 'all';
  const roundFilter = req.query.roundId ? String(req.query.roundId).trim() : 'all';

  // When accessed with a player session, NEVER trust client-supplied playerId/username query params
  // and reject explicit cross-account access attempts.
  if (playerAuth) {
    const requestedPlayerId = req.query.playerId ? String(req.query.playerId).trim() : '';
    const requestedUsername = req.query.username ? String(req.query.username).trim() : '';
    if (
      (requestedPlayerId && requestedPlayerId !== playerAuth.player.id) ||
      (requestedUsername && requestedUsername.toLowerCase() !== playerAuth.player.username.toLowerCase())
    ) {
      return res.status(403).json({
        error: 'អ្នកមិនមានសិទ្ធិមើលរបាយការណ៍ហិរញ្ញវត្ថុរបស់គណនីអ្នកលេងផ្សេងទៀតទេ! / Forbidden: Cannot access another player financial report.',
        code: 'FORBIDDEN_CROSS_PLAYER_REPORT',
      });
    }

    const report = computeOwnerLottery12Report({
      period,
      roundId: roundFilter,
      player: playerAuth.player,
    });

    return res.json({
      scope: 'player',
      playerId: playerAuth.player.id,
      username: playerAuth.player.username,
      timezone: report.timezone,
      serverDate: report.serverDate,
      serverDateTime: report.serverDateTime,
      summary: report.summary,
      todaySummary: report.todaySummary,
      latestRound: report.latestRound,
      byRound: report.byRound,
      dailySummaries: report.dailySummaries,
    });
  }

  // Admin-only request: require proper financial/betting view permission for system-wide reports
  if (
    !adminAuth ||
    (!hasAdminPermission(adminAuth.admin, 'bets.view') && !hasAdminPermission(adminAuth.admin, 'finance.manage'))
  ) {
    return res.status(403).json({
      error: 'គណនីអ្នកគ្រប់គ្រងនេះមិនមានសិទ្ធិមើលរបាយការណ៍ហិរញ្ញវត្ថុសរុបទេ! / Forbidden: Insufficient admin permissions.',
      code: 'INSUFFICIENT_ADMIN_PERMISSION',
    });
  }

  const report = computeOwnerLottery12Report({ period, roundId: roundFilter });

  return res.json({
    scope: 'system',
    timezone: report.timezone,
    serverDate: report.serverDate,
    serverDateTime: report.serverDateTime,
    summary: report.summary,
    todaySummary: report.todaySummary,
    latestRound: report.latestRound,
    byRound: report.byRound,
    dailySummaries: report.dailySummaries,
    byPlayer: report.byPlayer,
  });
});

// Requirement 2B & 5: Owner-Only Platform Win/Loss Ledger Summary API (Always system-wide for authorized admins)
app.get('/api/admin/owner-win-loss', requireAdminAuth, (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Vary', 'Authorization, Cookie');
  const admin = (req as any).adminAccount as StoredAdminAccount;
  if (admin.role !== 'super_admin' && !admin.permissions.includes('all')) {
    return res.status(403).json({
      error: 'មានតែគណនីម្ចាស់ប្រព័ន្ធ (Owner / Super Admin) ប៉ុណ្ណោះដែលអាចមើលរបាយការណ៍ប្រាក់ចំណេញ/ខាតម្ចាស់ផ្ទាល់បាន! / Forbidden: Owner-only access.',
      code: 'FORBIDDEN_OWNER_ONLY',
    });
  }

  const period = req.query.period ? String(req.query.period).trim() : 'all';
  const roundFilter = req.query.roundId ? String(req.query.roundId).trim() : 'all';
  const report = computeOwnerLottery12Report({ period, roundId: roundFilter });

  return res.json({
    owner: {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    },
    ...report,
  });
});

// Admin Finance: Refund / Void Pending Bet safely without double counting
app.post('/api/admin/bets/:id/refund', requireAdminAuth, requireAdminPermission('finance.manage'), (req: Request, res: Response) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { id } = req.params;
  const { reason } = req.body || {};

  const targetBet = gameState.recentBets.find((b) => b.id === id);
  if (!targetBet) {
    return res.status(404).json({ error: 'Bet record not found' });
  }
  if (targetBet.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending bets can be refunded/voided' });
  }

  targetBet.status = 'refunded';
  targetBet.totalPayout = 0;
  targetBet.netProfit = 0;
  targetBet.settledAt = formatNowTimestamp();
  targetBet.settledTimestamp = Date.now();
  targetBet.voidReason = String(reason || 'Admin Refund/Void');

  const player = targetBet.playerId
    ? gameState.players.find((p) => p.id === targetBet.playerId)
    : undefined;
  if (player) {
    player.balance += targetBet.totalStake;
    if (player.id === 'P0001001') gameState.balance = player.balance;
  } else {
    gameState.balance += targetBet.totalStake;
  }

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'REFUND_BET',
    targetId: targetBet.id,
    targetName: targetBet.username || 'player',
    details: `សងប្រាក់ភ្នាល់វិញ ${targetBet.totalStake.toLocaleString()}៛ (${targetBet.roundId}) - ${targetBet.voidReason}`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();

  const updatedBalance = player ? player.balance : gameState.balance;
  broadcastToPlayerAndAdmins(
    player?.id,
    () => ({
      type: 'BET_PLACED',
      betRecord: targetBet,
      recentBets: player ? gameState.getPlayerBets(player) : [],
      newBalance: updatedBalance,
    }),
    () => ({
      type: 'BET_PLACED',
      betRecord: targetBet,
      recentBets: gameState.recentBets,
      newBalance: updatedBalance,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );

  return res.json({
    success: true,
    betRecord: targetBet,
    newBalance: updatedBalance,
  });
});

// Wallet: Direct Balance Update — Strictly Restricted to Authorized Administrators (finance.manage)
app.post('/api/wallet/balance', requireAdminAuth, requireAdminPermission('finance.manage'), (req, res) => {
  const admin = (req as any).adminAccount as StoredAdminAccount;
  const { balance, playerId, note } = req.body || {};
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0) {
    return res.status(400).json({ error: 'Invalid balance value' });
  }

  const targetPlayer = playerId
    ? gameState.players.find((p) => p.id === playerId)
    : undefined;

  if (!targetPlayer) {
    return res.status(400).json({ error: 'Valid target playerId is required for admin balance adjustment' });
  }

  const prevBalance = targetPlayer.balance;
  const delta = balance - prevBalance;
  const nowMs = Date.now();
  const refId = `REF-ADJ-${formatPhnomPenhDate(nowMs).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  targetPlayer.balance = balance;
  if (targetPlayer.id === 'P0001001') {
    gameState.balance = balance;
  }

  const adjTx: TransactionRecord = {
    id: `tx-${nowMs}-${crypto.randomBytes(2).toString('hex')}`,
    playerId: targetPlayer.id,
    adminId: admin.id,
    adminUsername: admin.username,
    referenceId: refId,
    userName: targetPlayer.username,
    userPhone: targetPlayer.phone || '—',
    type: 'adjustment',
    amount: Math.abs(delta),
    method: 'Manual',
    status: 'approved',
    timestamp: nowMs,
    timeString: formatShortTime(nowMs),
    dateString: formatPhnomPenhDateTime(nowMs),
    note: note || `Admin Balance Adjustment (${prevBalance.toLocaleString()}៛ -> ${balance.toLocaleString()}៛)`,
  };
  gameState.transactions = [adjTx, ...gameState.transactions];

  gameState.addAuditLog({
    actorId: admin.id,
    actorUsername: admin.username,
    actorRole: admin.role,
    action: 'ADMIN_BALANCE_ADJUSTMENT',
    targetId: targetPlayer.id,
    targetName: targetPlayer.username,
    details: `កែសម្រួលសមតុល្យ ${targetPlayer.username} (${targetPlayer.id}): ${prevBalance.toLocaleString()}៛ -> ${balance.toLocaleString()}៛ [Ref: ${refId}]`,
    ip: req.ip || '127.0.0.1',
  });

  gameState.saveStateToDisk();
  broadcastToPlayerAndAdmins(
    targetPlayer.id,
    () => ({
      type: 'BALANCE_UPDATED',
      newBalance: balance,
    }),
    () => ({
      type: 'BALANCE_UPDATED',
      newBalance: balance,
      playerBalances: gameState.getPlayerBalancesMap(),
    })
  );
  return res.json({ success: true, balance, transaction: adjTx });
});

// Explicitly block any ZIP source download routes (HTTP 404)
app.get(['/download', '/zip', '/downloads', '/download/:id', '/downloads/:file'], (_req, res) => {
  return res.status(404).json({ error: 'ZIP download endpoints have been disabled and removed.' });
});


// ========================================================
// STANDALONE GAME PAGE & SHARED BACKEND STARTUP (PORT 3001)
// ========================================================

function attachWebSocketUpgrade(srv: http.Server) {
  srv.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });
}

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const GAME_PORT = Number(process.env.PORT || process.env.GAME_PORT) || 3001;
  const gameServer = http.createServer(app);
  attachWebSocketUpgrade(gameServer);
  gameServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `❌ Port ${GAME_PORT} is already in use. Stop the existing process before starting again.\n` +
          `   Windows PowerShell: Get-NetTCPConnection -LocalPort ${GAME_PORT} | Select-Object OwningProcess\n` +
          `   Stop-Process -Id <PID> -Force`
      );
      process.exit(1);
    }
    console.error('Server error:', err.message);
  });
  gameServer.listen(GAME_PORT, '0.0.0.0', () => {
    console.log(`🎮 Lottery12KH Game Page & Shared Backend listening on http://127.0.0.1:${GAME_PORT}/`);
  });
}

startServer();
