export type ColorGroup = 'red' | 'green' | 'blue';
export type SizeGroup = 'small' | 'big';
export type ParityGroup = 'odd' | 'even';

export interface AnimalData {
  number: number;
  khmerName: string;
  animalEn: string;
  color: ColorGroup;
  size: SizeGroup;
  parity: ParityGroup;
  odds: number;
}

export const ANIMALS_DATA: Record<number, AnimalData> = {
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

export interface DrawResult {
  roundId: string; // e.g. "2004#284"
  roundIndex: number;
  time: string;    // e.g. "16:22"
  number: number;  // 1..12
  animal: string;
  color: ColorGroup;
  size: SizeGroup;
  parity: ParityGroup;
  timestamp: number;
}

export type BetCategory = 
  | 'small'       // 1.95
  | 'big'         // 1.95
  | 'odd'         // 1.95
  | 'even'        // 1.95
  | 'color_red'   // 2.95
  | 'color_green' // 2.95
  | 'color_blue'  // 2.95
  | `animal_${number}`; // 11

export interface ActiveBet {
  type: BetCategory;
  label: string;
  amount: number;
  odds: number;
}

export interface BetHistoryRecord {
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

export type PostLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Lottery199Result {
  roundId: string;
  roundIndex: number;
  time: string;
  posts: Record<PostLetter, number>;
  timestamp: number;
}

export interface Lottery199BetRecord {
  id: string;
  roundId: string;
  time: string;
  posts: PostLetter[];
  numbers: string[];
  amountPerBet: number;
  totalStake: number;
  totalPayout: number;
  status: 'won' | 'lost' | 'pending';
  winningDetails?: { post: PostLetter; number: string; payout: number }[];
}

export type TransactionType = 'deposit' | 'withdrawal' | 'adjustment';
export type TransactionStatus = 'pending' | 'approved' | 'rejected';

export interface TransactionRecord {
  id: string;
  playerId?: string;
  adminId?: string;
  adminUsername?: string;
  referenceId?: string;
  userName: string;
  userPhone: string;
  type: TransactionType;
  amount: number;
  method: 'ABA Bank' | 'Wing' | 'ACLEDA' | 'TrueMoney' | 'Cash' | 'Manual';
  status: TransactionStatus;
  timestamp: number;
  timeString: string;
  dateString?: string;
  note?: string;
}

export interface OwnerLottery12RoundRow {
  roundId: string;
  resultNumber?: number;
  animal?: string;
  color?: ColorGroup;
  size?: SizeGroup;
  parity?: ParityGroup;
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
}

export interface OwnerLottery12DailyRow {
  date: string;
  settledRoundsCount: number;
  totalValidBets: number;
  totalValidStakes: number;
  totalPayouts: number;
  refundedStakes: number;
  ownerProfit: number;
  ownerLoss: number;
  netProfitLoss: number;
}

export interface OwnerLottery12Report {
  timezone: string;
  serverDate: string;
  serverDateTime: string;
  summary: {
    totalBetsCount: number;
    totalValidBets: number;
    totalValidStakes: number;
    totalPayouts: number;
    totalOwnerProfit: number;
    totalOwnerLoss: number;
    netOwnerProfitLoss: number;
    totalSettledRounds: number;
    totalAcceptedWagers: number;
    totalSettledStakes: number;
    totalActualWinningPayouts: number;
    totalRefundsVoided: number;
    pendingStakes: number;
    netPlatformWinLoss: number;
    wonCount: number;
    lostCount: number;
    pendingCount: number;
    refundedCount: number;
  };
  todaySummary: {
    date: string;
    settledRoundsCount: number;
    totalValidBets: number;
    totalValidStakes: number;
    totalPayouts: number;
    ownerProfit: number;
    ownerLoss: number;
    netProfitLoss: number;
  };
  latestRound: OwnerLottery12RoundRow | null;
  byRound: OwnerLottery12RoundRow[];
  dailySummaries: OwnerLottery12DailyRow[];
  byPlayer?: {
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
  }[];
}

export interface LiveBetItem {
  id: string;
  roundId: string;
  playerId?: string;
  userName: string;
  time: string;
  type: BetCategory;
  label: string;
  amount: number;
  odds: number;
  potentialPayout: number;
  timestamp: number;
}

export interface RoundSummaryReport {
  roundId: string;
  time: string;
  resultNumber: number;
  animal: string;
  totalTurnover: number;
  totalPayout: number;
  houseProfit: number;
  status: 'completed' | 'in_progress';
}

export type AccountStatus = 'active' | 'disabled';

export interface PlayerAccount {
  id: string;           // e.g. "P0002456"
  username: string;     // e.g. "player6688"
  displayName: string;
  phone: string;
  status: AccountStatus;
  balance: number;      // in Riel (៛)
  betsCount7d: number;
  createdAt: string;
  lastLogin: string | null;
  activeSessionsCount?: number;
}

export type AdminRole = 'super_admin' | 'operations_admin' | 'finance_auditor';

export interface AdminAccount {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: string[];
  status: AccountStatus;
  lastLogin: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
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

export interface PlatformSettings {
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
