import React, { useState, useEffect, useCallback } from 'react';
import { MainTab } from './HeaderNav';
import { OwnerLottery12Report } from '../types';
import { buildAuthHeaders } from '../utils/realtimeSync';
import { apiUrl } from '../utils/apiConfig';
import {
  Sparkles,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Award,
  Clock,
  RefreshCw,
  Calendar,
  Layers,
  ShieldCheck,
} from 'lucide-react';

interface OtherGamesViewProps {
  tab: MainTab;
  playerUsername?: string;
  onReturnTo12: () => void;
}

export const OtherGamesView: React.FC<OtherGamesViewProps> = ({ tab, playerUsername, onReturnTo12 }) => {
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

  const fetchSummaryReport = useCallback(async (signal?: AbortSignal) => {
    if (tab !== 'report') return;
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
          setError('មិនអាចទាញយករបាយការណ៍សរុបពីម៉ាស៊ីនមេបានទេ។');
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
  }, [tab, period, playerUsername]);

  useEffect(() => {
    setReport(null);
    setError(null);
  }, [playerUsername]);

  useEffect(() => {
    if (tab === 'report') {
      const controller = new AbortController();
      fetchSummaryReport(controller.signal);
      return () => controller.abort();
    }
  }, [tab, fetchSummaryReport]);

  // Summary Page (របាយការណ៍សរុប) — System Owner Win/Loss Reports
  if (tab === 'report') {
    const summary = report?.summary;
    const dailySummaries = report?.dailySummaries ?? [];
    const byRound = report?.byRound ?? [];

    return (
      <div className="flex-1 bg-slate-50 p-4 overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              របាយការណ៍សរុប — ឈ្នះ/ចាញ់ម្ចាស់ប្រព័ន្ធ (Summary Page — System Owner Win/Loss)
            </h2>
            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
              <span>
                គណនី: <strong className="text-blue-700">{playerUsername || '—'}</strong>
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
              onClick={() => fetchSummaryReport()}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>ធ្វើបច្ចុប្បន្នភាព</span>
            </button>
            <button
              onClick={onReturnTo12}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs shadow flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>ត្រឡប់ទៅ ឆ្នោត 12</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Accounting Transparency Note */}
        <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              របាយការណ៍នេះគណនាដោយស្វ័យប្រវត្តិពីកំណត់ត្រាភ្នាល់ឆ្នោត #12 ដែលបានទូទាត់ពិតប្រាកដប៉ុណ្ណោះ។
              ការដាក់ប្រាក់ ឬការបន្ថែមទឹកប្រាក់ដោយអ្នកគ្រប់គ្រង និងការភ្នាល់ដែលត្រូវបានលុបចោល/សងវិញ <strong>មិនត្រូវបានរាប់ជាប្រាក់ចំណេញភ្នាល់ឡើយ</strong>។
            </span>
          </div>
          {(summary?.refundedCount ?? 0) > 0 && (
            <span className="font-mono font-bold text-slate-700">
              Void/Refunded: {summary?.refundedCount} ({formatKHR(summary?.totalRefundsVoided ?? 0)})
            </span>
          )}
        </div>

        {/* 6 KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">ប្រាក់ចំណេញម្ចាស់សរុប (Owner Profit)</div>
            <div className="text-base font-bold text-emerald-600 font-mono mt-1" data-testid="summary-owner-profit">
              {formatKHR(summary?.totalOwnerProfit ?? 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">ប្រាក់ខាតម្ចាស់សរុប (Owner Loss)</div>
            <div className="text-base font-bold text-rose-600 font-mono mt-1" data-testid="summary-owner-loss">
              {formatKHR(summary?.totalOwnerLoss ?? 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">ចំណេញ/ខាត សុទ្ធ (Net P/L)</div>
            <div
              data-testid="summary-owner-net"
              className={`text-base font-extrabold font-mono mt-1 flex items-center gap-1 ${
                (summary?.netOwnerProfitLoss ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {(summary?.netOwnerProfitLoss ?? 0) >= 0 ? (
                <TrendingUp className="w-4 h-4 shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 shrink-0" />
              )}
              <span>{formatSignedKHR(summary?.netOwnerProfitLoss ?? 0)}</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">ភ្នាល់សុពលភាពសរុប (Valid Stakes)</div>
            <div className="text-base font-bold text-slate-800 font-mono mt-1" data-testid="summary-valid-stakes">
              {formatKHR(summary?.totalValidStakes ?? 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">ប្រាក់ទូទាត់អ្នកឈ្នះ (Player Payouts)</div>
            <div className="text-base font-bold text-amber-700 font-mono mt-1" data-testid="summary-player-payouts">
              {formatKHR(summary?.totalPayouts ?? 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">ជុំឆ្នោត #12 ដែលបានទូទាត់ (Rounds)</div>
            <div className="text-base font-bold text-blue-700 font-mono mt-1 flex items-center gap-1.5" data-testid="summary-settled-rounds">
              <Award className="w-4 h-4 text-blue-500 shrink-0" />
              <span>{summary?.totalSettledRounds ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Daily Win/Loss Summaries Table */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>របាយការណ៍ឈ្នះ/ចាញ់ប្រចាំថ្ងៃ (Daily System Owner Summaries — Asia/Phnom_Penh)</span>
            </div>
            <span className="text-xs text-slate-500">{dailySummaries.length} ថ្ងៃ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">កាលបរិច្ឆេទ (Date)</th>
                  <th className="py-2.5 px-3 text-center">ជុំទូទាត់ (Settled Rounds)</th>
                  <th className="py-2.5 px-3 text-center">ភ្នាល់សុពលភាព (Valid Bets)</th>
                  <th className="py-2.5 px-3 text-right">ភ្នាល់សរុប (Valid Stakes)</th>
                  <th className="py-2.5 px-3 text-right">ទូទាត់សរុប (Payouts)</th>
                  <th className="py-2.5 px-3 text-right">លុបចោល/សងវិញ (Refunded)</th>
                  <th className="py-2.5 px-3 text-right">ចំណេញម្ចាស់ (Profit)</th>
                  <th className="py-2.5 px-3 text-right">ខាតម្ចាស់ (Loss)</th>
                  <th className="py-2.5 px-3 text-right">ចំណេញ/ខាត សុទ្ធ (Net P/L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {dailySummaries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400 italic">
                      មិនទាន់មានទិន្នន័យសរុបប្រចាំថ្ងៃនៅឡើយទេ
                    </td>
                  </tr>
                ) : (
                  dailySummaries.map((d) => (
                    <tr key={d.date} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{d.date}</td>
                      <td className="py-2.5 px-3 text-center font-semibold">{d.settledRoundsCount}</td>
                      <td className="py-2.5 px-3 text-center">{d.totalValidBets}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatKHR(d.totalValidStakes)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700">{formatKHR(d.totalPayouts)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">{formatKHR(d.refundedStakes)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">{formatKHR(d.ownerProfit)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">{formatKHR(d.ownerLoss)}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-extrabold ${
                          d.netProfitLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {formatSignedKHR(d.netProfitLoss)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Historical Win/Loss Records with Date & Time */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>ប្រវត្តិឈ្នះ/ចាញ់តាមជុំឆ្នោត #12 (Historical Win/Loss Records)</span>
            </div>
            <span className="text-xs text-slate-500">{byRound.length} ជុំ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">លេខជុំ (Round)</th>
                  <th className="py-2.5 px-3">លទ្ធផល (Result)</th>
                  <th className="py-2.5 px-3">កាលបរិច្ឆេទ & ម៉ោង (Cambodia)</th>
                  <th className="py-2.5 px-3 text-center">ភ្នាល់សុពលភាព</th>
                  <th className="py-2.5 px-3 text-right">ភ្នាល់សរុប</th>
                  <th className="py-2.5 px-3 text-right">ទូទាត់សរុប</th>
                  <th className="py-2.5 px-3 text-right">ចំណេញម្ចាស់</th>
                  <th className="py-2.5 px-3 text-right">ខាតម្ចាស់</th>
                  <th className="py-2.5 px-3 text-right">ចំណេញ/ខាត សុទ្ធ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {byRound.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400 italic">
                      មិនទាន់មានកំណត់ត្រាជុំឆ្នោតដែលបានទូទាត់នៅឡើយទេ
                    </td>
                  </tr>
                ) : (
                  byRound.map((r) => (
                    <tr key={r.roundId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{r.roundId}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {r.resultNumber ? `លេខ ${r.resultNumber} ${r.animal || ''}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{r.dateTime}</td>
                      <td className="py-2.5 px-3 text-center">{r.validBetsCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatKHR(r.settledStakes)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700">{formatKHR(r.actualPayouts)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">{formatKHR(r.ownerProfit)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">{formatKHR(r.ownerLoss)}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-extrabold ${
                          r.netPlatformWinLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {formatSignedKHR(r.netPlatformWinLoss)}
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
  }

  const getTabInfo = () => {
    switch (tab) {
      case 'home':
        return {
          title: 'ទំព័រដើម (Portal Home)',
          desc: 'សូមស្វាគមន៍មកកាន់ប្រព័ន្ធឆ្នោតស្តង់ដារអន្តរជាតិ។ សូមជ្រើសរើស "ឆ្នោត 12" ដើម្បីចូលរួមការភ្នាល់ផ្ទាល់។',
        };
      case 'images':
        return {
          title: 'វិចិត្រសាលរូបភាព (Photo Gallery)',
          desc: 'ផ្ទាំងរូបភាពនិមិត្តសញ្ញា 12 សត្វ និងពានមាសសំណាង។',
        };
      case 'lottery_5':
        return {
          title: 'ឆ្នោត 5 (Lottery 5)',
          desc: 'ការចាប់រង្វាន់លេខ ៥ ខ្ទង់រៀងរាល់ ១៥ នាទី។',
        };
      case 'lottery_6_36':
        return {
          title: 'ឆ្នោត 6/36 (Lottery 6/36)',
          desc: 'ការជ្រើសរើស ៦ លេខក្នុងចំណោម ៣៦ លេខ ជាមួយរង្វាន់ Jackpot ធំសម្បើម។',
        };
      case 'lottery_90':
        return {
          title: 'ឆ្នោត 90 (Lottery 90)',
          desc: 'ឆ្នោតលេខធំ ៩០ គ្រាប់ ជាមួយប្រព័ន្ធបង្វិលស្វ័យប្រវត្តិ។',
        };
      case 'lotto_5d':
        return {
          title: 'ឡូតូ 5D (Lotto 5D)',
          desc: 'ការភ្នាល់លេខ 5D កន្ទុយលេខរង្វាន់ធំ។',
        };
      case 'lottery_1_12':
        return {
          title: 'ឆ្នោត 1/12 (Lottery 1/12)',
          desc: 'ការភ្នាល់ ១ ក្នុងចំណោម ១២ សត្វ។',
        };
      case 'lottery_1_99':
        return {
          title: 'ឆ្នោត 1/99 ត្រូវបានដកចេញ (Disabled)',
          desc: 'ប្រភេទឆ្នោត 1/99 លែងដំណើរការទៀតហើយ។ សូមប្រើប្រាស់ ឆ្នោត 12 (Lottery #12)។',
        };
      case 'password':
        return {
          title: 'ពាក្យសម្ងាត់ និងសុវត្ថិភាព (Account Security)',
          desc: 'គ្រប់គ្រងលេខសម្ងាត់ PIN ចូលប្រព័ន្ធ និងការផ្ទៀងផ្ទាត់ ២ ជាន់។',
        };
      case 'image_results':
        return {
          title: 'លទ្ធផល រូបភាព (Image Results)',
          desc: 'រូបភាពផ្ទៀងផ្ទាត់ផ្លូវការនៃលទ្ធផលឆ្នោត 12 សត្វ។',
        };
      default:
        return {
          title: 'ម៉ូឌុលឆ្នោត',
          desc: 'កំពុងដំណើរការ...',
        };
    }
  };

  const info = getTabInfo();

  return (
    <div className="flex-1 bg-slate-50 p-6 flex flex-col items-center justify-center text-center">
      <div className="max-w-md bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{info.title}</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">{info.desc}</p>
        <button
          onClick={onReturnTo12}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow flex items-center gap-2 mx-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ត្រឡប់ទៅ ឆ្នោត 12 (Go to Lottery 12)</span>
        </button>
      </div>
    </div>
  );
};
