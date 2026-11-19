import React, { useState, useEffect, useCallback } from 'react';
import { BetHistoryRecord, OwnerLottery12Report } from '../types';
import { TrendingUp, TrendingDown, Award, RefreshCw, Clock, Layers, ShieldCheck } from 'lucide-react';
import { buildAuthHeaders } from '../utils/realtimeSync';
import { apiUrl } from '../utils/apiConfig';

interface WinLossViewProps {
  playerUsername?: string;
  records: BetHistoryRecord[];
  onBackToGame: () => void;
}

export const WinLossView: React.FC<WinLossViewProps> = ({
  playerUsername,
  records,
  onBackToGame,
}) => {
  const [period, setPeriod] = useState<'all' | 'today' | '7d'>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [report, setReport] = useState<OwnerLottery12Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatKHR = (amount: number) => `${Math.round(amount).toLocaleString()}៛`;

  const formatSignedKHR = (amount: number) => {
    const rounded = Math.round(amount);
    if (rounded > 0) return `+${rounded.toLocaleString()}៛`;
    if (rounded < 0) return `-${Math.abs(rounded).toLocaleString()}៛`;
    return '+0៛';
  };

  const recordsSignature = records
    .slice(0, 25)
    .map((r) => `${r.id}:${r.status}:${r.totalPayout}`)
    .join('|');

  const fetchLottery12WinLoss = useCallback(async (signal?: AbortSignal) => {
    const abortSignal = signal instanceof AbortSignal ? signal : undefined;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/lottery12/win-loss?period=${encodeURIComponent(period)}`), {
        headers: buildAuthHeaders(false),
        credentials: 'include',
        cache: 'no-store',
        signal: abortSignal,
      });
      if (!res.ok) {
        if (!abortSignal?.aborted) {
          setReport(null);
          setError('មិនអាចទាញយកទិន្នន័យឈ្នះ/ចាញ់ពីម៉ាស៊ីនមេបានទេ។');
        }
        return;
      }
      const data: OwnerLottery12Report = await res.json();
      if (!abortSignal?.aborted) {
        setReport(data);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortSignal?.aborted) return;
      setError('បរាជ័យក្នុងការភ្ជាប់ទៅម៉ាស៊ីនមេ។');
    } finally {
      if (!abortSignal?.aborted) {
        setLoading(false);
      }
    }
  }, [period, playerUsername]);

  // Clear any previous player's cached report immediately whenever the active player changes
  useEffect(() => {
    setReport(null);
    setError(null);
  }, [playerUsername]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLottery12WinLoss(controller.signal);
    return () => controller.abort();
  }, [fetchLottery12WinLoss, recordsSignature]);

  const summary = report?.summary;
  const completedRounds = report?.byRound ?? [];

  return (
    <div className="flex-1 bg-slate-50 p-4 overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            លទ្ធផលឈ្នះ-ចាញ់ ឆ្នោត #12 (System Owner Win/Loss Results)
          </h2>
          <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5" data-testid="winloss-player-username">
            <span>
              គណនី: <strong className="text-blue-700 font-bold">{playerUsername || '—'}</strong>
            </span>
            <span>|</span>
            <span className="inline-flex items-center gap-1 font-mono text-slate-600">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>{report?.serverDateTime || 'Asia/Phnom_Penh'} (ICT / UTC+7)</span>
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'all' | 'today' | '7d')}
            className="px-3 py-2 border border-slate-300 rounded bg-white text-slate-700 font-semibold text-xs shadow-xs"
          >
            <option value="all">គ្រប់ពេលទាំងអស់ (All Time)</option>
            <option value="today">ថ្ងៃនេះ (Today)</option>
            <option value="7d">៧ ថ្ងៃចុងក្រោយ (Last 7 Days)</option>
          </select>
          <button
            type="button"
            onClick={() => fetchLottery12WinLoss()}
            className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>ធ្វើបច្ចុប្បន្នភាព</span>
          </button>
          <button
            onClick={onBackToGame}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs shadow cursor-pointer"
          >
            ត្រឡប់ទៅការភ្នាល់ (Return to Game)
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Owner Perspective Accounting Formula Banner */}
      <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>រូបមន្តគណនាម្ចាស់ប្រព័ន្ធ (Owner Perspective):</strong>{' '}
            ប្រាក់ចំណេញ/ខាតសុទ្ធ = ប្រាក់ភ្នាល់ដែលមានសុពលភាពសរុប − ប្រាក់ទូទាត់ជូនអ្នកឈ្នះសរុប
            (គណនាតែការភ្នាល់ឆ្នោត #12 ដែលបានទូទាត់រួចប៉ុណ្ណោះ — មិនរាប់បញ្ចូលការដាក់ប្រាក់ ឬការភ្នាល់ដែលត្រូវបានលុបចោលឡើយ)
          </span>
        </div>
        <span className="font-mono font-bold text-blue-700">
          Settled Rounds: {summary?.totalSettledRounds ?? 0} | Valid Bets: {summary?.totalValidBets ?? 0}
        </span>
      </div>

      {/* KPI Summary Cards (System Owner Perspective) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 font-black text-lg flex items-center justify-center shrink-0">
            ៛
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">ប្រាក់ភ្នាល់សុពលភាព (Valid Stakes)</div>
            <div className="text-base font-bold text-slate-800 font-mono" data-testid="owner-total-stakes">
              {formatKHR(summary?.totalValidStakes ?? 0)}
            </div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-amber-50 text-amber-600 shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">ប្រាក់ទូទាត់សរុប (Total Payouts)</div>
            <div className="text-base font-bold text-amber-700 font-mono" data-testid="owner-total-payouts">
              {formatKHR(summary?.totalPayouts ?? 0)}
            </div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">ប្រាក់ចំណេញម្ចាស់ (Owner Profit)</div>
            <div className="text-base font-bold text-emerald-600 font-mono" data-testid="owner-gross-profit">
              {formatKHR(summary?.totalOwnerProfit ?? 0)}
            </div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-rose-50 text-rose-600 shrink-0">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">ប្រាក់ខាតម្ចាស់ (Owner Loss)</div>
            <div className="text-base font-bold text-rose-600 font-mono" data-testid="owner-gross-loss">
              {formatKHR(summary?.totalOwnerLoss ?? 0)}
            </div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center gap-3">
          <div
            className={`p-2.5 rounded-full shrink-0 ${
              (summary?.netOwnerProfitLoss ?? 0) >= 0
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-rose-50 text-rose-600'
            }`}
          >
            {(summary?.netOwnerProfitLoss ?? 0) >= 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">ចំណេញ/ខាត សុទ្ធ (Owner Net P/L)</div>
            <div
              data-testid="owner-net-profit-loss"
              className={`text-base font-bold font-mono ${
                (summary?.netOwnerProfitLoss ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {formatSignedKHR(summary?.netOwnerProfitLoss ?? 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Completed & Settled Lottery #12 Rounds Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>
              លទ្ធផលឈ្នះ/ចាញ់ម្ចាស់ប្រព័ន្ធតាមជុំឆ្នោត #12 ({completedRounds.length} ជុំដែលបានទូទាត់)
            </span>
          </div>
          <div className="text-xs text-slate-500">
            កំណត់ត្រាពិតប្រាកដពីមូលដ្ឋានទិន្នន័យ (Actual Settled Records Only)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-2.5 px-3">លេខជុំ (Round)</th>
                <th className="py-2.5 px-3">លទ្ធផលជាក់ស្តែង (Result)</th>
                <th className="py-2.5 px-3">កាលបរិច្ឆេទ & ម៉ោង (Cambodia)</th>
                <th className="py-2.5 px-3 text-center">ចំនួនភ្នាល់ (Valid Bets)</th>
                <th className="py-2.5 px-3 text-right">ភ្នាល់សរុប (Total Stakes)</th>
                <th className="py-2.5 px-3 text-right">ទូទាត់សរុប (Total Payouts)</th>
                <th className="py-2.5 px-3 text-right">ចំណេញម្ចាស់ (Owner Profit)</th>
                <th className="py-2.5 px-3 text-right">ខាតម្ចាស់ (Owner Loss)</th>
                <th className="py-2.5 px-3 text-right">ចំណេញ/ខាត សុទ្ធ (Net P/L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {completedRounds.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                    មិនទាន់មានជុំឆ្នោត #12 ដែលបានទូទាត់ការភ្នាល់នៅឡើយទេ
                  </td>
                </tr>
              ) : (
                completedRounds.map((row) => (
                  <tr key={row.roundId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{row.roundId}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {row.resultNumber ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                          លេខ {row.resultNumber} {row.animal || ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{row.dateTime}</td>
                    <td className="py-2.5 px-3 text-center font-bold">{row.validBetsCount}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {formatKHR(row.settledStakes)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-700">
                      {formatKHR(row.actualPayouts)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                      {formatKHR(row.ownerProfit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                      {formatKHR(row.ownerLoss)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-extrabold ${
                        row.netPlatformWinLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {formatSignedKHR(row.netPlatformWinLoss)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
