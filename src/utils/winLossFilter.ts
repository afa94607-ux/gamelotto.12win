import type { BetHistoryRecord, DrawResult, OwnerLottery12Report } from '../types';

export type WinLossFilterMode = 'today' | 'yesterday' | '7d' | '1m' | 'all' | 'custom';

export const CAMBODIA_TZ = 'Asia/Phnom_Penh';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getCambodiaDateKey(ts: number = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: CAMBODIA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export function formatCambodiaDateTime(ts: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CAMBODIA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ts));
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const hh = map.hour === '24' ? '00' : map.hour || '00';
    return `${map.year}-${map.month}-${map.day} ${hh}:${map.minute}:${map.second}`;
  } catch {
    return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
  }
}

export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateKey.split('-').map((v) => parseInt(v, 10));
  return {
    year: Number.isFinite(y) ? y : 2026,
    month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1,
    day: Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1,
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildDateKey(year: number, month: number, day: number): string {
  const maxDay = getDaysInMonth(year, month);
  const safeDay = Math.max(1, Math.min(day, maxDay));
  return `${year}-${pad2(month)}-${pad2(safeDay)}`;
}

export function addDaysCambodia(dateKey: string, deltaDays: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

export function subtractOneCalendarMonth(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return buildDateKey(prevYear, prevMonth, day);
}

export function resolveFilterRange(
  mode: WinLossFilterMode,
  todayKey: string,
  selectedDateKey: string
): { startKey: string | null; endKey: string | null } {
  switch (mode) {
    case 'today':
      return { startKey: todayKey, endKey: todayKey };
    case 'yesterday': {
      const y = addDaysCambodia(todayKey, -1);
      return { startKey: y, endKey: y };
    }
    case '7d':
      return { startKey: addDaysCambodia(todayKey, -6), endKey: todayKey };
    case '1m':
      return { startKey: subtractOneCalendarMonth(todayKey), endKey: todayKey };
    case 'custom':
      return { startKey: selectedDateKey, endKey: selectedDateKey };
    case 'all':
    default:
      return { startKey: null, endKey: null };
  }
}

export function computeFilteredWinLossReport(params: {
  records: BetHistoryRecord[];
  history: DrawResult[];
  serverReport: OwnerLottery12Report | null;
  filterMode: WinLossFilterMode;
  todayKey: string;
  selectedDateKey: string;
}): {
  startKey: string | null;
  endKey: string | null;
  totalValidStakes: number;
  totalPayouts: number;
  totalOwnerProfit: number;
  totalOwnerLoss: number;
  netOwnerProfitLoss: number;
  totalSettledRounds: number;
  totalValidBets: number;
  byRound: OwnerLottery12Report['byRound'];
} {
  const { records, history, serverReport, filterMode, todayKey, selectedDateKey } = params;
  const { startKey, endKey } = resolveFilterRange(filterMode, todayKey, selectedDateKey);

  // When All Time is selected and backend report is loaded, prefer authoritative backend report
  if (filterMode === 'all' && serverReport) {
    return {
      startKey: null,
      endKey: null,
      totalValidStakes: serverReport.summary.totalValidStakes,
      totalPayouts: serverReport.summary.totalPayouts,
      totalOwnerProfit: serverReport.summary.totalOwnerProfit,
      totalOwnerLoss: serverReport.summary.totalOwnerLoss,
      netOwnerProfitLoss: serverReport.summary.netOwnerProfitLoss,
      totalSettledRounds: serverReport.summary.totalSettledRounds,
      totalValidBets: serverReport.summary.totalValidBets,
      byRound: (serverReport.byRound || []).filter((r) => r.validBetsCount > 0),
    };
  }

  const historyByRound = new Map<string, DrawResult>();
  for (const h of history) {
    if (!historyByRound.has(h.roundId)) {
      historyByRound.set(h.roundId, h);
    }
  }

  let totalValidStakes = 0;
  let totalPayouts = 0;
  let totalOwnerProfit = 0;
  let totalOwnerLoss = 0;
  let totalValidBets = 0;

  type RoundAccum = OwnerLottery12Report['byRound'][number] & { _ts: number };
  const roundMap = new Map<string, RoundAccum>();

  for (const rec of records) {
    // Only settled bets count toward settled-only Win/Loss metrics (exclude pending, refunded, voided)
    if (rec.status !== 'won' && rec.status !== 'lost') continue;

    const draw = historyByRound.get(rec.roundId);
    const ts = rec.settledTimestamp || draw?.timestamp || rec.placedTimestamp;
    if (!ts || !Number.isFinite(ts)) continue;

    const betDay = getCambodiaDateKey(ts);
    if (startKey && betDay < startKey) continue;
    if (endKey && betDay > endKey) continue;

    const stake = Math.round(Number(rec.totalStake) || 0);
    const payout = Math.round(Number(rec.totalPayout) || 0);
    const net = stake - payout;
    const betProfit = net >= 0 ? net : 0;
    const betLoss = net < 0 ? Math.abs(net) : 0;

    totalValidBets += 1;
    totalValidStakes += stake;
    totalPayouts += payout;
    totalOwnerProfit += betProfit;
    totalOwnerLoss += betLoss;

    let rEntry = roundMap.get(rec.roundId);
    if (!rEntry) {
      const dtStr = formatCambodiaDateTime(draw?.timestamp || ts);
      rEntry = {
        roundId: rec.roundId,
        resultNumber: draw?.number ?? rec.resultNumber,
        animal: draw?.animal,
        color: draw?.color,
        size: draw?.size,
        parity: draw?.parity,
        date: betDay,
        time: draw?.time || dtStr.slice(11, 16),
        dateTime: dtStr,
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
        _ts: draw?.timestamp || ts,
      };
      roundMap.set(rec.roundId, rEntry);
    }

    rEntry.betsCount += 1;
    rEntry.validBetsCount += 1;
    rEntry.acceptedWagers += stake;
    rEntry.settledStakes += stake;
    rEntry.actualPayouts += payout;
    rEntry.ownerProfit += betProfit;
    rEntry.ownerLoss += betLoss;
    rEntry.netPlatformWinLoss = rEntry.settledStakes - rEntry.actualPayouts;
  }

  const byRound = Array.from(roundMap.values())
    .sort((a, b) => b._ts - a._ts)
    .map(({ _ts, ...rest }) => rest);

  return {
    startKey,
    endKey,
    totalValidStakes,
    totalPayouts,
    totalOwnerProfit,
    totalOwnerLoss,
    netOwnerProfitLoss: totalValidStakes - totalPayouts,
    totalSettledRounds: byRound.length,
    totalValidBets,
    byRound,
  };
}
