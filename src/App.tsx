import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { HeaderNav, MainTab, SubTab } from './components/HeaderNav';
import { Sidebar } from './components/Sidebar';
import { Side2BowlArena } from './components/Side2BowlArena';
import {
  testConnection,
  subscribeToGameState,
  subscribeToDrawHistory,
  updateFirestoreGameState,
  addFirestoreDrawResult,
  signInWithGoogle,
  signOutUser,
  auth,
} from './lib/firebase';
import { BettingBoard } from './components/BettingBoard';
import { RoadGrid } from './components/RoadGrid';
import { WinLossView } from './components/WinLossView';
import { ResultsView } from './components/ResultsView';
import { OtherGamesView } from './components/OtherGamesView';
import { PlayerLoginPage } from './components/PlayerLoginPage';
import { HelpRulesModal } from './components/HelpRulesModal';
import { BetAmountModal } from './components/BetAmountModal';
import { HowItWorksModal } from './components/HowItWorksModal';
import { sound } from './utils/sound';
import { countdownAudioSync, CountdownSyncSegment } from './utils/countdownAudioSync';
import {
  realtimeSync,
  ConnectionStatus,
  buildAuthHeaders,
  setPlayerToken,
} from './utils/realtimeSync';
import { apiUrl, parseJsonSafe } from './utils/apiConfig';
import {
  ANIMALS_DATA,
  DrawResult,
  BetCategory,
  BetHistoryRecord,
  TransactionRecord,
  TransactionStatus,
  PlayerAccount,
} from './types';

// Preloaded historical results replicating the exact image data and streak roads from image_9d92c28c.png
const INITIAL_HISTORY: DrawResult[] = [
  // Col 15
  { roundId: '2004#283', roundIndex: 283, time: '16:19', number: 1, animal: 'ជូត', color: 'red', size: 'small', parity: 'odd', timestamp: Date.now() - 60000 },
  // Col 14
  { roundId: '2004#282', roundIndex: 282, time: '16:15', number: 9, animal: 'វក', color: 'blue', size: 'big', parity: 'odd', timestamp: Date.now() - 120000 },
  { roundId: '2004#281', roundIndex: 281, time: '16:12', number: 8, animal: 'មមែ', color: 'green', size: 'big', parity: 'even', timestamp: Date.now() - 180000 },
  // Col 13 (6 items)
  { roundId: '2004#280', roundIndex: 280, time: '16:08', number: 10, animal: 'រកា', color: 'red', size: 'big', parity: 'even', timestamp: Date.now() - 240000 },
  { roundId: '2004#279', roundIndex: 279, time: '16:05', number: 11, animal: 'ច', color: 'green', size: 'big', parity: 'odd', timestamp: Date.now() - 300000 },
  { roundId: '2004#278', roundIndex: 278, time: '16:01', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 360000 },
  { roundId: '2004#277', roundIndex: 277, time: '15:58', number: 9, animal: 'វក', color: 'blue', size: 'big', parity: 'odd', timestamp: Date.now() - 420000 },
  { roundId: '2004#276', roundIndex: 276, time: '15:54', number: 10, animal: 'រកា', color: 'red', size: 'big', parity: 'even', timestamp: Date.now() - 480000 },
  { roundId: '2004#275', roundIndex: 275, time: '15:50', number: 8, animal: 'មមែ', color: 'green', size: 'big', parity: 'even', timestamp: Date.now() - 540000 },
  // Col 12 (2 items)
  { roundId: '2004#274', roundIndex: 274, time: '15:47', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 600000 },
  { roundId: '2004#273', roundIndex: 273, time: '15:43', number: 2, animal: 'ឆ្លូវ', color: 'green', size: 'small', parity: 'even', timestamp: Date.now() - 660000 },
  // Col 11
  { roundId: '2004#272', roundIndex: 272, time: '15:40', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 720000 },
  // Col 10
  { roundId: '2004#271', roundIndex: 271, time: '15:36', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 780000 },
  // Col 9 (2 items)
  { roundId: '2004#270', roundIndex: 270, time: '15:32', number: 8, animal: 'មមែ', color: 'green', size: 'big', parity: 'even', timestamp: Date.now() - 840000 },
  { roundId: '2004#269', roundIndex: 269, time: '15:28', number: 11, animal: 'ច', color: 'green', size: 'big', parity: 'odd', timestamp: Date.now() - 900000 },
  // Col 8
  { roundId: '2004#268', roundIndex: 268, time: '15:25', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 960000 },
  // Col 7
  { roundId: '2004#267', roundIndex: 267, time: '15:21', number: 7, animal: 'មមី', color: 'red', size: 'big', parity: 'odd', timestamp: Date.now() - 1020000 },
  // Col 6 (4 items)
  { roundId: '2004#266', roundIndex: 266, time: '15:18', number: 5, animal: 'រោង', color: 'green', size: 'small', parity: 'odd', timestamp: Date.now() - 1080000 },
  { roundId: '2004#265', roundIndex: 265, time: '15:14', number: 5, animal: 'រោង', color: 'green', size: 'small', parity: 'odd', timestamp: Date.now() - 1140000 },
  { roundId: '2004#264', roundIndex: 264, time: '15:10', number: 1, animal: 'ជូត', color: 'red', size: 'small', parity: 'odd', timestamp: Date.now() - 1200000 },
  { roundId: '2004#263', roundIndex: 263, time: '15:06', number: 6, animal: 'ម្សាញ់', color: 'blue', size: 'small', parity: 'even', timestamp: Date.now() - 1260000 },
  // Col 5 (2 items)
  { roundId: '2004#262', roundIndex: 262, time: '15:02', number: 10, animal: 'រកា', color: 'red', size: 'big', parity: 'even', timestamp: Date.now() - 1320000 },
  { roundId: '2004#261', roundIndex: 261, time: '14:58', number: 7, animal: 'មមី', color: 'red', size: 'big', parity: 'odd', timestamp: Date.now() - 1380000 },
  // Col 4
  { roundId: '2004#260', roundIndex: 260, time: '14:54', number: 1, animal: 'ជូត', color: 'red', size: 'small', parity: 'odd', timestamp: Date.now() - 1440000 },
  // Col 3
  { roundId: '2004#259', roundIndex: 259, time: '14:50', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 1500000 },
  // Col 2
  { roundId: '2004#258', roundIndex: 258, time: '14:46', number: 2, animal: 'ឆ្លូវ', color: 'green', size: 'small', parity: 'even', timestamp: Date.now() - 1560000 },
  // Col 1
  { roundId: '2004#257', roundIndex: 257, time: '14:42', number: 12, animal: 'កុរ', color: 'blue', size: 'big', parity: 'even', timestamp: Date.now() - 1620000 },
];

export default function App() {
  // Determine initial portal mode: Standalone Admin on port 5174 or /admin path, otherwise Player Game Page
  const portalMode: 'player' = 'player';

  const [authenticatedPlayer, setAuthenticatedPlayer] = useState<PlayerAccount | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const authenticatedPlayerRef = useRef<PlayerAccount | null>(null);
  useEffect(() => {
    authenticatedPlayerRef.current = authenticatedPlayer;
  }, [authenticatedPlayer]);

  // Clear all private player state and remove any legacy global caches
  const clearPrivatePlayerState = () => {
    setBalance(0);
    setRecentBetRecords([]);
    setTransactions([]);
    setConfirmedBets({});
    setPendingBets({});
    setLastRoundBets({});
    setWinNotice(null);
    try {
      localStorage.removeItem('cambodia_lottery_balance_v2');
      localStorage.removeItem('cambodia_lottery_12_bet_history_v2');
      localStorage.removeItem('cambodia_lottery_transactions_v2');
    } catch {
      // ignore
    }
  };

  // Verify existing Player and Admin sessions on mount
  useEffect(() => {
    let mounted = true;
    // Purge legacy global private caches on startup so previous accounts never leak
    try {
      localStorage.removeItem('cambodia_lottery_balance_v2');
      localStorage.removeItem('cambodia_lottery_12_bet_history_v2');
      localStorage.removeItem('cambodia_lottery_transactions_v2');
    } catch {
      // ignore
    }

    const verifySessions = async () => {
      try {
        const playerRes = await fetch(apiUrl('/api/auth/player/session'), {
          headers: buildAuthHeaders(false),
          credentials: 'include',
        }).catch(() => null);

        if (mounted && playerRes && playerRes.ok) {
          const pData = await parseJsonSafe(playerRes);
          if (pData?.authenticated && pData?.player) {
            authenticatedPlayerRef.current = pData.player;
            setAuthenticatedPlayer(pData.player);
            if (typeof pData.player.balance === 'number') {
              setBalance(pData.player.balance);
            }
          } else {
            setPlayerToken(null);
            clearPrivatePlayerState();
          }
        } else if (mounted) {
          setPlayerToken(null);
          clearPrivatePlayerState();
        }

      } finally {
        if (mounted) {
          setAuthChecking(false);
          realtimeSync.reauthenticateSocket('player');
          realtimeSync.fetchInitialState(false);
        }
      }
    };
    verifySessions();
    return () => {
      mounted = false;
    };
  }, []);

  const handlePlayerLogout = async () => {
    try {
      await fetch(apiUrl('/api/auth/player/logout'), {
        method: 'POST',
        headers: buildAuthHeaders(false),
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    setPlayerToken(null);
    authenticatedPlayerRef.current = null;
    setAuthenticatedPlayer(null);
    clearPrivatePlayerState();
    realtimeSync.reauthenticateSocket('player');
  };

  // Navigation State
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('lottery_12');
  const handleSelectMainTab = (tab: MainTab) => {
    if (tab === 'lottery_1_99') {
      setActiveMainTab('lottery_12');
      return;
    }
    setActiveMainTab(tab);
  };
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('lottery');
  const [mobileView, setMobileView] = useState<'full' | 'game' | 'sidebar'>('full');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState<boolean>(false);
  const lastServerTickRef = useRef<number>(Date.now());
  const roundEndTimestampRef = useRef<number>(Date.now() + 180000);
  const getCambodiaDateKey = (ts: number) => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Phnom_Penh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ts));
    } catch {
      return new Date(ts).toISOString().slice(0, 10);
    }
  };

  const serverOffsetMsRef = useRef<number>(0);
  const [cambodiaToday, setCambodiaToday] = useState<string>(() => getCambodiaDateKey(Date.now()));
  const cambodiaTodayRef = useRef<string>(cambodiaToday);
  const hasServerClockRef = useRef<boolean>(false);
  const isRevealingRef = useRef<boolean>(false);
  const isRoundPausedRef = useRef<boolean>(false);
  const currentRoundIndexRef = useRef<number>(284);
  const portalModeRef = useRef<'player' | 'admin'>(portalMode);
  useEffect(() => {
    portalModeRef.current = portalMode;
    realtimeSync.setPortalMode(portalMode);
  }, [portalMode]);

  const CURRENT_ROUND_STORAGE_KEY = 'cambodia_lottery_current_round_v2';
  const DRAW_HISTORY_STORAGE_KEY = 'cambodia_lottery_12_draw_history_v2';

  // Account & Wallet State (Always hydrated strictly from authenticated backend session, never global localStorage)
  const [balance, setBalance] = useState<number>(0);

  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Round & Timer State (3 minutes / 180s per round)
  const [countdown, setCountdown] = useState<number>(180);
  const [currentRoundIndex, setCurrentRoundIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_ROUND_STORAGE_KEY);
      if (saved) {
        const val = Number(saved);
        if (!isNaN(val) && val >= 284) return val;
      }
    } catch (e) {}
    return 284;
  });

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_ROUND_STORAGE_KEY, currentRoundIndex.toString());
    } catch (e) {}
  }, [currentRoundIndex]);

  const [currentRoundTime, setCurrentRoundTime] = useState<string>('16:22');
  const [isRevealing, setIsRevealing] = useState<boolean>(false);
  const [revealStep, setRevealStep] = useState<number>(0); // 0: closed, 1..6: row 1, 7..11: row 2, 12: row 3 final result
  const [pendingWinningResult, setPendingWinningResult] = useState<DrawResult | null>(null);
  
  // Admin Panel Control States
  const [forcedWinningNumber, setForcedWinningNumber] = useState<number | null>(null);

  // Transactions State (Strictly scoped to authenticated player from backend; no mock or global localStorage cache)
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  const handleSetForcedWinningNumber = (num: number | null) => {
    setForcedWinningNumber(num);
    realtimeSync.setForcedResult(num);
    updateFirestoreGameState({ forcedWinningNumber: num });
  };

  const handleAddTransaction = (newTx: Omit<TransactionRecord, 'id' | 'timestamp' | 'timeString'>) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const record: TransactionRecord = {
      ...newTx,
      id: `tx-${Date.now()}`,
      timestamp: Date.now(),
      timeString: timeStr,
    };
    setTransactions((prev) => [record, ...prev]);
    realtimeSync.createTransaction(newTx);
  };

  const handleUpdateTransactionStatus = (id: string, status: TransactionStatus) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
    realtimeSync.updateTransactionStatus(id, status);
  };

  const handleAddManualResult = (result: DrawResult) => {
    setHistory((prev) => [result, ...prev]);
    realtimeSync.addManualResult(result);
    addFirestoreDrawResult(result);
  };

  const handleDeleteResult = (roundId: string) => {
    setHistory((prev) => prev.filter((r) => r.roundId !== roundId));
    realtimeSync.deleteResult(roundId);
  };

  const handleTriggerImmediateDraw = (targetNum?: number) => {
    if (targetNum && targetNum >= 1 && targetNum <= 12) {
      setForcedWinningNumber(targetNum);
    }
    realtimeSync.forceDrawNow(targetNum ?? forcedWinningNumber ?? undefined);
    updateFirestoreGameState({
      isRevealing: true,
      revealStep: 1,
      forcedWinningNumber: targetNum ?? forcedWinningNumber ?? null,
    });
  };

  // Real-time cross-device synchronization hook
  useEffect(() => {
    testConnection();
    realtimeSync.connect(portalModeRef.current);
    realtimeSync.fetchInitialState(portalModeRef.current === 'admin');

    const unsubStatus = realtimeSync.subscribeStatus((st) => setConnectionStatus(st));

    // Authoritative Firestore Listeners
    const unsubFirestoreGame = subscribeToGameState((firestoreState) => {
      if (!firestoreState) return;
      if (firestoreState.forcedWinningNumber !== undefined) {
        setForcedWinningNumber(firestoreState.forcedWinningNumber);
      }
      if (firestoreState.isRevealing !== undefined) {
        setIsRevealing(firestoreState.isRevealing);
      }
      if (firestoreState.revealStep !== undefined) {
        setRevealStep(firestoreState.revealStep);
      }
      if (firestoreState.countdown !== undefined) {
        setCountdown(firestoreState.countdown);
      }
      if (firestoreState.roundIndex !== undefined) {
        setCurrentRoundIndex(firestoreState.roundIndex);
      }
    });

    const unsubFirestoreHistory = subscribeToDrawHistory((firestoreHistory) => {
      if (firestoreHistory && firestoreHistory.length > 0) {
        setHistory((prev) => {
          const map = new Map<string, DrawResult>();
          firestoreHistory.forEach((item: any) => {
            if (item.roundId) map.set(item.roundId, item as DrawResult);
          });
          prev.forEach((item) => {
            if (!map.has(item.roundId)) map.set(item.roundId, item);
          });
          return Array.from(map.values()).sort((a, b) => (b.roundIndex || 0) - (a.roundIndex || 0));
        });
      }
    });

    const syncAuthoritativeAudioAndCountdown = () => {
      // Countdown audio only runs in player portal mode
      if (portalModeRef.current !== 'player') {
        countdownAudioSync.stop();
        return;
      }

      if (!hasServerClockRef.current) return;

      const syncRes = countdownAudioSync.syncToAuthoritativeTime({
        roundIndex: currentRoundIndexRef.current,
        roundEndTimestamp: roundEndTimestampRef.current,
        serverOffsetMs: serverOffsetMsRef.current,
        isRevealing: isRevealingRef.current,
        isPaused: isRoundPausedRef.current,
        isMuted: sound.isMuted(),
        onSegmentUpdate: (seg, num) => {
          setAudioSyncSegment(seg);
          setIsAudioSyncing(Boolean(seg));
          if (seg) {
            setIsBetModalOpen(false);
            setCountdown(num);
          }
        },
      });

      if (!isRevealingRef.current && !isRoundPausedRef.current && !syncRes.active) {
        setCountdown(syncRes.countdown);
      }
    };

    const unsubMute = sound.subscribeMuteChange((muted) => {
      countdownAudioSync.setMuted(muted);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        realtimeSync.fetchInitialState();
        syncAuthoritativeAudioAndCountdown();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const authoritativeClockInterval = setInterval(() => {
      syncAuthoritativeAudioAndCountdown();
      const nextCambodiaDay = getCambodiaDateKey(Date.now() + serverOffsetMsRef.current);
      if (nextCambodiaDay !== cambodiaTodayRef.current) {
        cambodiaTodayRef.current = nextCambodiaDay;
        setCambodiaToday(nextCambodiaDay);
      }
    }, 100);

    const unsubscribe = realtimeSync.subscribe((stateUpdate, eventType, rawMsg) => {
      lastServerTickRef.current = Date.now();
      const currentP = authenticatedPlayerRef.current;

      if (typeof stateUpdate.serverNow === 'number') {
        serverOffsetMsRef.current = stateUpdate.serverNow - Date.now();
        const serverDay = getCambodiaDateKey(stateUpdate.serverNow);
        if (serverDay !== cambodiaTodayRef.current) {
          cambodiaTodayRef.current = serverDay;
          setCambodiaToday(serverDay);
        }
      }
      if (typeof stateUpdate.roundEndTimestamp === 'number') {
        roundEndTimestampRef.current = stateUpdate.roundEndTimestamp;
        hasServerClockRef.current = true;
      }
      if (stateUpdate.isRoundPaused !== undefined) {
        isRoundPausedRef.current = Boolean(stateUpdate.isRoundPaused);
      }

      if (stateUpdate.countdown !== undefined) setCountdown(stateUpdate.countdown);
      if (stateUpdate.currentRoundIndex !== undefined) {
        currentRoundIndexRef.current = stateUpdate.currentRoundIndex;
        setCurrentRoundIndex(stateUpdate.currentRoundIndex);
      }
      if (stateUpdate.currentRoundTime !== undefined) setCurrentRoundTime(stateUpdate.currentRoundTime);
      if (stateUpdate.isRevealing !== undefined) {
        isRevealingRef.current = stateUpdate.isRevealing;
        setIsRevealing(stateUpdate.isRevealing);
      }
      if (stateUpdate.revealStep !== undefined) {
        setRevealStep(stateUpdate.revealStep);
        if (stateUpdate.revealStep >= 1 && stateUpdate.revealStep <= 11) {
          sound.playCardFlip(stateUpdate.revealStep);
        } else if (stateUpdate.revealStep === 12) {
          sound.playGongReveal();
        }
      }
      if (stateUpdate.drawMix !== undefined) setDrawMix(stateUpdate.drawMix);
      if (stateUpdate.forcedWinningNumber !== undefined) setForcedWinningNumber(stateUpdate.forcedWinningNumber);
      if (stateUpdate.pendingWinningResult !== undefined) setPendingWinningResult(stateUpdate.pendingWinningResult);
      if (stateUpdate.history !== undefined) setHistory(stateUpdate.history);

      if (stateUpdate.authenticatedPlayer && currentP && stateUpdate.authenticatedPlayer.id === currentP.id) {
        setAuthenticatedPlayer(stateUpdate.authenticatedPlayer);
      }

      if (currentP) {
        if (stateUpdate.playerBalances && typeof stateUpdate.playerBalances[currentP.id] === 'number') {
          setBalance(stateUpdate.playerBalances[currentP.id]);
        } else if (stateUpdate.balance !== undefined) {
          setBalance(stateUpdate.balance);
        }
      } else {
        setBalance(0);
      }

      if (stateUpdate.recentBets !== undefined) {
        if (currentP) {
          setRecentBetRecords(
            stateUpdate.recentBets.filter(
              (b) =>
                b.playerId === currentP.id ||
                (!b.playerId && b.username?.toLowerCase() === currentP.username.toLowerCase())
            )
          );
        } else {
          setRecentBetRecords([]);
        }
      }

      if (stateUpdate.transactions !== undefined) {
        if (currentP) {
          setTransactions(
            stateUpdate.transactions.filter(
              (t) =>
                t.playerId === currentP.id ||
                (!t.playerId && t.userName?.toLowerCase() === currentP.username.toLowerCase())
            )
          );
        } else {
          setTransactions([]);
        }
      }

      if (eventType === 'PLAYER_UPDATED' && rawMsg?.player && currentP && rawMsg.player.id === currentP.id) {
        if (rawMsg.player.status === 'disabled') {
          setPlayerToken(null);
          authenticatedPlayerRef.current = null;
          setAuthenticatedPlayer(null);
          clearPrivatePlayerState();
          realtimeSync.reauthenticateSocket('player');
        } else {
          setAuthenticatedPlayer(rawMsg.player);
          if (typeof rawMsg.player.balance === 'number') {
            setBalance(rawMsg.player.balance);
          }
        }
      }

      if (eventType === 'COUNTDOWN_10S_START' || eventType === 'TICK' || eventType === 'INIT_STATE') {
        syncAuthoritativeAudioAndCountdown();
      }

      if (eventType === 'DRAW_STARTED') {
        isRevealingRef.current = true;
        countdownAudioSync.stop();
        setIsAudioSyncing(false);
        setAudioSyncSegment(null);
        sound.playBowlShake();
      }

      if (eventType === 'DRAW_FINISHED') {
        if (stateUpdate.pendingWinningResult) {
          finalizeBets(stateUpdate.pendingWinningResult, true, stateUpdate.recentBets);
        }
      }

      if (eventType === 'ROUND_RESET') {
        isRevealingRef.current = false;
        countdownAudioSync.stop();
        setIsAudioSyncing(false);
        setAudioSyncSegment(null);
        setIsRevealing(false);
        setRevealStep(0);
        setPendingWinningResult(null);
        setWinNotice(null);
        setConfirmedBets({});
        setPendingBets({});
      }

      if (eventType === 'SESSION_REVOKED') {
        // Re-check player session immediately if revoked by admin
        fetch(apiUrl('/api/auth/player/session'), {
          headers: buildAuthHeaders(false),
          credentials: 'include',
        })
          .then((res) => {
            if (!res.ok) {
              setPlayerToken(null);
              authenticatedPlayerRef.current = null;
              setAuthenticatedPlayer(null);
              clearPrivatePlayerState();
              realtimeSync.reauthenticateSocket('player');
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      clearInterval(authoritativeClockInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubMute();
      unsubscribe();
      unsubStatus();
      unsubFirestoreGame();
      unsubFirestoreHistory();
    };
  }, []);

  // Helper to generate a completely randomized mix of numbers 1..12
  const generateRandomMix = (): number[] => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers;
  };

  // Randomized mix of numbers for the round (shuffled 1..12)
  const [drawMix, setDrawMix] = useState<number[]>(() => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers;
  });

  const drawTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Real-Time Sound & Figure Synchronization States (10s Countdown)
  const [audioSyncSegment, setAudioSyncSegment] = useState<CountdownSyncSegment | null>(null);
  const [isAudioSyncing, setIsAudioSyncing] = useState<boolean>(false);
  const [betBlockedNotice, setBetBlockedNotice] = useState<string | null>(null);

  // Once 10 seconds remain, the acceptance of new bets is closed
  const isBettingClosed = countdown <= 10 || isRevealing || isAudioSyncing;

  // Clear all pending draw sequence timeouts
  const clearAllDrawTimeouts = () => {
    drawTimeoutsRef.current.forEach((t) => clearTimeout(t));
    drawTimeoutsRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearAllDrawTimeouts();
      countdownAudioSync.stop();
    };
  }, []);

  // Start the 10-second vocal audio countdown with real-time sound & figure synchronization
  const start10sCountdown = () => {
    if (isRevealing || isAudioSyncing) return;
    setIsAudioSyncing(true);
    setIsBetModalOpen(false); // Close bet specification modal immediately
    setCountdown(10);

    countdownAudioSync.start(
      (segment) => {
        setAudioSyncSegment(segment);
        setCountdown(segment.number);
      },
      () => {
        // When audio finishes (after «សូមសំណាងល្អ» 0 / Draw), initiate draw sequence to reveal new result
        setIsAudioSyncing(false);
        setAudioSyncSegment(null);
        // If disconnected from backend, use local draw fallback
        if (connectionStatus === 'disconnected') {
          startDrawSequence(true);
        }
      },
      sound.isMuted()
    );
  };

  const handleBlockedAttempt = () => {
    sound.playBlocked();
    setBetBlockedNotice('⚠️ ការទទួលការភ្នាល់ត្រូវបានបិទ! (Betting Closed - មិនទទួលការភ្នាល់ក្នុងអំឡុងពេលរាប់ថយក្រោយឡើយ)');
    setTimeout(() => {
      setBetBlockedNotice(null);
    }, 3200);
  };

  // Results History with persistent local caching for instant zero-flicker reloads
  const [history, setHistory] = useState<DrawResult[]>(() => {
    try {
      const saved = localStorage.getItem(DRAW_HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load draw history from localStorage', e);
    }
    return INITIAL_HISTORY;
  });
  const latestResult = history[0] || null;

  // Persist history updates to localStorage
  useEffect(() => {
    try {
      if (history && history.length > 0) {
        localStorage.setItem(DRAW_HISTORY_STORAGE_KEY, JSON.stringify(history));
      }
    } catch (e) {
      console.warn('Failed to save draw history to localStorage', e);
    }
  }, [history]);

  // Betting State
  const [selectedChip, setSelectedChip] = useState<number>(10000); // 10,000 KHR default
  const [pendingBets, setPendingBets] = useState<Record<string, number>>({});
  const [confirmedBets, setConfirmedBets] = useState<Record<string, number>>({});
  const [lastRoundBets, setLastRoundBets] = useState<Record<string, number>>({});
  
  // Authoritative Personal Betting History (Never persisted to shared global localStorage)
  const [recentBetRecords, setRecentBetRecords] = useState<BetHistoryRecord[]>([]);

  // Bet Amount Modal State (Appears when clicking to place a bet as per image_f977baed.png)
  const [isBetModalOpen, setIsBetModalOpen] = useState<boolean>(false);
  const [selectedBetTarget, setSelectedBetTarget] = useState<{
    category: BetCategory;
    odds: number;
    label: string;
  } | null>(null);

  // Winning Announcement Toast
  const [winNotice, setWinNotice] = useState<{ amount: number; number: number; animal: string } | null>(null);

  // Calculation of totals
  const pendingBetsTotal = Object.values(pendingBets).reduce((a, b) => a + b, 0);
  const confirmedBetsTotal = Object.values(confirmedBets).reduce((a, b) => a + b, 0);

  // Active bets map displayed on the board
  const displayedBets = { ...confirmedBets, ...pendingBets };

  // Offline Fallback Countdown Loop (Only active when server clock hasn't arrived for >5s and disconnected)
  useEffect(() => {
    if (isRevealing || isAudioSyncing) return;

    const timer = setInterval(() => {
      const timeSinceLastServerTick = Date.now() - lastServerTickRef.current;
      if (!hasServerClockRef.current && timeSinceLastServerTick > 5000) {
        setCountdown((prev) => {
          if (prev <= 11) {
            start10sCountdown();
            return 10;
          }
          if (prev % 10 === 0) {
            sound.playTick();
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isRevealing, isAudioSyncing, currentRoundIndex]);

  // Settle bets when final winning result appears
  const finalizeBets = (
    outcome: DrawResult,
    fromServerAuthoritative: boolean = false,
    serverScopedBets?: BetHistoryRecord[]
  ) => {
    let roundTotalWinPayout = 0;
    const currentRoundId = outcome.roundId;

    if (fromServerAuthoritative && Array.isArray(serverScopedBets)) {
      const currentP = authenticatedPlayerRef.current;
      const ownRoundWins = serverScopedBets.filter(
        (rec) =>
          rec.roundId === currentRoundId &&
          rec.status === 'won' &&
          (!currentP || rec.playerId === currentP.id)
      );
      roundTotalWinPayout = ownRoundWins.reduce((sum, rec) => sum + (rec.totalPayout || 0), 0);
    } else {
      // Helper to evaluate if a bet category won against the outcome (offline fallback only)
      const checkIsCategoryWon = (catKey: BetCategory): boolean => {
        if (catKey === 'small') return outcome.size === 'small';
        if (catKey === 'big') return outcome.size === 'big';
        if (catKey === 'odd') return outcome.parity === 'odd';
        if (catKey === 'even') return outcome.parity === 'even';
        if (catKey === 'color_red') return outcome.color === 'red';
        if (catKey === 'color_green') return outcome.color === 'green';
        if (catKey === 'color_blue') return outcome.color === 'blue';
        if (catKey.startsWith('animal_')) {
          const betNum = parseInt(catKey.replace('animal_', ''), 10);
          return betNum === outcome.number;
        }
        return false;
      };

      setRecentBetRecords((prevRecords) => {
        return prevRecords.map((rec) => {
          if (rec.status !== 'pending' || rec.roundId !== currentRoundId) {
            return rec;
          }

          let recordWonPayout = 0;
          const updatedBets = rec.bets.map((b) => {
            const won = checkIsCategoryWon(b.type);
            const payout = won ? Math.round(b.amount * b.odds) : 0;
            if (won) {
              recordWonPayout += payout;
            }
            return {
              ...b,
              won,
              payout,
            };
          });

          const isWon = recordWonPayout > 0;
          if (isWon) {
            roundTotalWinPayout += recordWonPayout;
          }

          return {
            ...rec,
            bets: updatedBets,
            totalPayout: recordWonPayout,
            netProfit: isWon ? recordWonPayout - rec.totalStake : -rec.totalStake,
            resultNumber: outcome.number,
            status: isWon ? 'won' : 'lost',
          };
        });
      });

      if (roundTotalWinPayout > 0 && !fromServerAuthoritative) {
        setBalance((prev) => prev + roundTotalWinPayout);
      }
    }

    // Trigger celebratory animations on winning round
    if (roundTotalWinPayout > 0) {
      setWinNotice({
        amount: roundTotalWinPayout,
        number: outcome.number,
        animal: outcome.animal,
      });

      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#eab308', '#f59e0b', '#3b82f6', '#ef4444', '#10b981'],
      });
      sound.playWin();
    }
  };

  // Sequence of New Result Display (Only occurs AFTER audible countdown finishes)
  const startDrawSequence = (fromAudioCompletion: boolean = false) => {
    // Enforce that audible countdown must finish before revealing new results!
    if (!fromAudioCompletion) {
      if (!isRevealing && !isAudioSyncing) {
        start10sCountdown();
      }
      return;
    }

    if (isRevealing) return;
    clearAllDrawTimeouts();
    countdownAudioSync.stop();
    setIsAudioSyncing(false);
    setAudioSyncSegment(null);

    // 1. Generate new randomized mix of numbers 1..12 (appears randomly and consists of a mix of numbers)
    let winningNum: number;
    let mix = generateRandomMix();
    if (forcedWinningNumber && forcedWinningNumber >= 1 && forcedWinningNumber <= 12) {
      winningNum = forcedWinningNumber;
      // Put forcedWinningNumber at index 11 (the 12th bowl / final result)
      const remaining = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((n) => n !== forcedWinningNumber);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      mix = [...remaining, forcedWinningNumber];
      setForcedWinningNumber(null);
    } else {
      winningNum = mix[11];
    }
    setDrawMix(mix);
    const animal = ANIMALS_DATA[winningNum];

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const roundId = `2004#${currentRoundIndex}`;

    const outcomeResult: DrawResult = {
      roundId,
      roundIndex: currentRoundIndex,
      time: timeStr,
      number: winningNum,
      animal: animal.khmerName,
      color: animal.color,
      size: animal.size,
      parity: animal.parity,
      timestamp: Date.now(),
    };

    setPendingWinningResult(outcomeResult);
    setIsRevealing(true);
    setCountdown(0);
    sound.playBowlShake();

    // Row 1 (Positions 1–6): Each number appears with an interval of 1,100 milliseconds (ms)
    // Step 1: Open Number 1 at t = 0ms
    setRevealStep(1);
    sound.playCardFlip(1);

    // Numbers 2 to 6 with 1,100 ms interval
    for (let s = 2; s <= 6; s++) {
      const delay = (s - 1) * 1100;
      const t = setTimeout(() => {
        setRevealStep(s);
        sound.playCardFlip(s);
      }, delay);
      drawTimeoutsRef.current.push(t);
    }

    // Row 2 (Positions 7–11): Each number appears with an interval of 1,100 milliseconds (ms)
    for (let s = 7; s <= 11; s++) {
      const delay = (s - 1) * 1100;
      const t = setTimeout(() => {
        setRevealStep(s);
        sound.playCardFlip(s);
      }, delay);
      drawTimeoutsRef.current.push(t);
    }

    // Row 3 (Final Result/Position 12): The final winning result appears 1,100 milliseconds (ms) after the last number of the second row
    // Number 11 was at delay = 10 * 1100 = 11,000 ms.
    // Row 3 appears at delay = 11 * 1100 = 12,100 ms (exactly 1,100ms after Number 11).
    const finalResultDelay = 11 * 1100;
    const tFinal = setTimeout(() => {
      setRevealStep(12);
      sound.playGongReveal();

      // Settle bets and calculate winnings
      finalizeBets(outcomeResult);

      // Add to history records & streak tables
      setHistory((prev) => [outcomeResult, ...prev]);

      // Display of Winning Results: Once the final winning result is displayed,
      // it remains on the screen for 5,000 milliseconds (5 seconds) before resetting for the next round.
      const tReset = setTimeout(() => {
        countdownAudioSync.stop();
        setIsAudioSyncing(false);
        setAudioSyncSegment(null);
        setIsRevealing(false);
        setRevealStep(0);
        setPendingWinningResult(null);
        setWinNotice(null);
        setCountdown(180); // Reset for next 3-minute round
        setCurrentRoundIndex((prev) => prev + 1);
        setDrawMix(generateRandomMix()); // Fresh randomized mix for the next round

        if (Object.keys(confirmedBets).length > 0) {
          setLastRoundBets(confirmedBets);
        }
        setConfirmedBets({});
        setPendingBets({});
      }, 5000);
      drawTimeoutsRef.current.push(tReset);
    }, finalResultDelay);
    drawTimeoutsRef.current.push(tFinal);
  };

  // Place bet triggers the bet amount specification modal (image_f977baed.png)
  const handlePlaceBet = (category: BetCategory, defaultOdds: number, label: string) => {
    if (isBettingClosed) {
      handleBlockedAttempt();
      return;
    }
    setSelectedBetTarget({ category, odds: defaultOdds, label });
    setIsBetModalOpen(true);
  };

  const handleConfirmBetFromModal = (
    category: BetCategory,
    amount: number,
    label: string,
    odds: number,
    _singlePost: boolean
  ) => {
    if (isBettingClosed) {
      handleBlockedAttempt();
      return;
    }
    if (balance < amount) {
      sound.playBlocked();
      setBetBlockedNotice(
        'ទឹកប្រាក់របស់អ្នកមិនគ្រប់គ្រាន់ទេ! សូមទាក់ទងអ្នកគ្រប់គ្រង (Admin) ដើម្បីដាក់ប្រាក់។'
      );
      setTimeout(() => setBetBlockedNotice(null), 3500);
      return;
    }
    setBalance((prev) => prev - amount);
    setConfirmedBets((prev) => {
      const cur = prev[category] || 0;
      return {
        ...prev,
        [category]: cur + amount,
      };
    });

    // Immediate bet recording requirement:
    // "Every time a bet is placed, the data must be immediately recorded in the betting history,
    // including the bet details, the wagered amount, and the potential winnings."
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const potentialWin = Math.round(amount * odds);

    const newRecord: BetHistoryRecord = {
      id: `bet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      playerId: authenticatedPlayer?.id,
      username: authenticatedPlayer?.username,
      roundId: `2004#${currentRoundIndex}`,
      time: timeStr,
      bets: [
        {
          type: category,
          label: label || category,
          amount,
          odds,
          potentialWin,
          won: false,
          payout: 0,
        },
      ],
      totalStake: amount,
      totalPotentialPayout: potentialWin,
      totalPayout: 0,
      netProfit: -amount,
      status: 'pending',
    };

    setRecentBetRecords((prev) => [newRecord, ...prev]);
    realtimeSync.placeBet(newRecord).then((res) => {
      if (res?.success && typeof res.newBalance === 'number') {
        setBalance(res.newBalance);
      } else {
        // Roll back optimistic state if server rejected the bet
        setRecentBetRecords((prev) => prev.filter((r) => r.id !== newRecord.id));
        realtimeSync.fetchInitialState(false);
        if (res?.error) {
          sound.playBlocked();
          setBetBlockedNotice(res.error);
          setTimeout(() => setBetBlockedNotice(null), 3500);
        }
      }
    });
  };

  // Clear local view of betting history if requested (server records remain intact)
  const handleClearBetHistory = () => {
    setRecentBetRecords([]);
  };

  // Clear bets
  const handleClearBets = () => {
    setConfirmedBets({});
    setPendingBets({});
  };

  // Double x2 pending bets
  const handleDoubleBets = () => {
    setPendingBets((prev) => {
      const doubled: Record<string, number> = {};
      Object.entries(prev).forEach(([k, v]) => {
        doubled[k] = v * 2;
      });
      return doubled;
    });
  };

  // Repeat previous round bets
  const handleRepeatBets = () => {
    if (Object.keys(lastRoundBets).length === 0) return;
    setPendingBets(lastRoundBets);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#090d24] flex items-center justify-center text-amber-300 font-['Kantumruy_Pro',sans-serif]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-amber-400 border-t-transparent animate-spin" />
          <span className="text-sm font-bold">កំពុងផ្ទៀងផ្ទាត់ប្រព័ន្ធ... / Loading Lottery12KH...</span>
        </div>
      </div>
    );
  }

  // PLAYER GAME PORTAL (Port 3001 or /) — Requires Authorized Player Login
  if (!authenticatedPlayer) {
    return (
      <PlayerLoginPage
        onLoginSuccess={(player) => {
          clearPrivatePlayerState();
          authenticatedPlayerRef.current = player;
          setAuthenticatedPlayer(player);
          if (typeof player.balance === 'number') {
            setBalance(player.balance);
          }
          realtimeSync.reauthenticateSocket('player');
          realtimeSync.fetchInitialState(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col font-['Kantumruy_Pro',sans-serif] text-slate-800">
      {/* 1. Header Navigation Bar (Matches screenshot top tabs) */}
      <HeaderNav
        activeMainTab={activeMainTab}
        onSelectMainTab={handleSelectMainTab}
        activeSubTab={activeSubTab}
        onSelectSubTab={setActiveSubTab}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
        connectionStatus={connectionStatus}
        playerUsername={authenticatedPlayer.username}
        onPlayerLogout={handlePlayerLogout}
      />

      {/* 2. Main Body Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {activeMainTab !== 'lottery_12' ? (
          <OtherGamesView
            key={authenticatedPlayer.id}
            tab={activeMainTab}
            playerUsername={authenticatedPlayer.username}
            onReturnTo12={() => setActiveMainTab('lottery_12')}
          />
        ) : activeSubTab === 'win_loss' ? (
          <WinLossView
            key={authenticatedPlayer.id}
            playerUsername={authenticatedPlayer.username}
            records={recentBetRecords}
            history={history}
            currentCambodiaDate={cambodiaToday}
            onBackToGame={() => setActiveSubTab('lottery')}
          />
        ) : activeSubTab === 'results' ? (
          <ResultsView
            history={history}
            onBackToGame={() => setActiveSubTab('lottery')}
          />
        ) : (
          /* Main Cambodian 12 Lottery Board (Responsive & Consistent across all devices) */
          <div className="flex-1 flex flex-col w-full overflow-hidden">
            {/* Mobile View Switcher Tabs (Only visible on screens < lg) */}
            <div className="lg:hidden bg-slate-900 border-b border-slate-700 px-2 sm:px-3 py-1.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[11px] font-bold">
                <button
                  onClick={() => setMobileView('full')}
                  className={`px-2.5 py-1 rounded transition-all flex items-center gap-1 ${
                    mobileView === 'full'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="ប្លង់ពេញលេញដូចកុំព្យូទ័រ (Full Kiosk Layout)"
                >
                  <span>📱</span>
                  <span>ប្លង់ពេញ (Full)</span>
                </button>
                <button
                  onClick={() => setMobileView('game')}
                  className={`px-2.5 py-1 rounded transition-all flex items-center gap-1 ${
                    mobileView === 'game'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="មើលតែផ្ទាំងឆ្នោត (Board Only)"
                >
                  <span>🎲</span>
                  <span>ផ្ទាំងឆ្នោត</span>
                </button>
                <button
                  onClick={() => setMobileView('sidebar')}
                  className={`px-2.5 py-1 rounded transition-all flex items-center gap-1 ${
                    mobileView === 'sidebar'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="មើលសមតុល្យ និងប្រវត្តិ (Account & History)"
                >
                  <span>📋</span>
                  <span>គណនី</span>
                </button>
              </div>
              <div className="text-xs font-mono font-bold text-emerald-400 bg-black/40 px-2.5 py-1 rounded-md border border-emerald-500/30">
                {balance.toLocaleString()}៛
              </div>
            </div>

            <div className={`flex-1 flex flex-col lg:flex-row overflow-y-auto ${mobileView === 'full' ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
              <div className={`flex flex-col lg:flex-row flex-1 ${mobileView === 'full' ? 'min-w-[980px] lg:min-w-0' : 'w-full'}`}>
                {/* Left Sidebar (Balance, Latest Results, Recent Bets) */}
                <div className={`${mobileView === 'full' || mobileView === 'sidebar' ? 'block' : 'hidden'} lg:block shrink-0`}>
                  <Sidebar
                    playerUsername={authenticatedPlayer.username}
                    balance={balance}
                    activeBetsTotal={confirmedBetsTotal + pendingBetsTotal}
                    latestResults={history}
                    recentBets={recentBetRecords}
                    currentCambodiaDate={cambodiaToday}
                    onRefreshResults={() => sound.playButton()}
                    onClearBetsHistory={handleClearBetHistory}
                  />
                </div>

                {/* Right Main Playfield */}
                <div className={`${mobileView === 'full' || mobileView === 'game' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col bg-white overflow-x-auto min-w-0 w-full`}>
                  {/* Top Row: Center Bowls (Left) & Betting Odds + 12 Animals (Right) */}
                  <div className="flex flex-col md:flex-row border-b border-[#94a3b8]">
                  {/* 12 Bowls & Center Main Chamber */}
                  <Side2BowlArena
                    countdown={countdown}
                    isRevealing={isRevealing}
                    revealStep={revealStep}
                    latestResult={isRevealing ? pendingWinningResult : latestResult}
                    drawMix={drawMix}
                    currentRoundId={`2004#${currentRoundIndex}`}
                    onBowlClick={(num) =>
                      handlePlaceBet(`animal_${num}` as BetCategory, 11, `ពានលេខ ${num}`)
                    }
                    onTriggerDraw={start10sCountdown}
                    audioSyncSegment={audioSyncSegment}
                    isBettingClosed={isBettingClosed}
                    onTrigger10sCountdown={start10sCountdown}
                    onBlockedAttempt={handleBlockedAttempt}
                  />

                  {/* Right Betting Board (Countdown block, odds buttons, 12 animal cards) */}
                  <BettingBoard
                    countdown={countdown}
                    currentRoundId={`2004#${currentRoundIndex}`}
                    currentRoundTime={currentRoundTime}
                    activeBets={displayedBets}
                    onPlaceBet={handlePlaceBet}
                    selectedChip={selectedChip}
                    latestResult={isRevealing && revealStep >= 12 ? pendingWinningResult : latestResult}
                    isRevealing={isRevealing && revealStep >= 12}
                    revealStep={revealStep}
                    onRefreshRound={start10sCountdown}
                    audioSyncSegment={audioSyncSegment}
                    isBettingClosed={isBettingClosed}
                    onBlockedAttempt={handleBlockedAttempt}
                  />
                </div>

                {/* Bottom Row: Streak Roads & Bead Plate (លេខ / តូចធំ & ពណ៌ / សេសគូ) */}
                <RoadGrid history={history} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Floating Bet Blocked Warning Toast */}
      {betBlockedNotice && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white px-6 py-2.5 rounded-full shadow-2xl border-2 border-yellow-300 flex items-center gap-3 animate-bounce">
          <span className="text-xl">🚫</span>
          <div className="font-black text-sm drop-shadow">
            {betBlockedNotice}
          </div>
        </div>
      )}

      {/* Floating Win Notification Banner */}
      {winNotice && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-900 px-6 py-2.5 rounded-full shadow-2xl border-2 border-white flex items-center gap-3 animate-bounce">
          <span className="text-xl">🏆</span>
          <div className="font-black text-sm">
            អបអរសាទរ! អ្នកបានឈ្នះ{' '}
            <span className="text-red-700 font-extrabold text-base underline">
              +{winNotice.amount.toLocaleString()}៛
            </span>{' '}
            (លេខ {winNotice.number} {winNotice.animal})
          </div>
        </div>
      )}

      {/* Help & Rules Modal */}
      <HelpRulesModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      {/* Bet Amount Specification Modal (Matches image_f977baed.png) */}
      <BetAmountModal
        isOpen={isBetModalOpen}
        onClose={() => setIsBetModalOpen(false)}
        onConfirmBet={handleConfirmBetFromModal}
        currentRoundId={`2005#${currentRoundIndex}`}
        currentRoundTime={currentRoundTime}
        betCategory={selectedBetTarget?.category || null}
        betLabel={selectedBetTarget?.label || ''}
        betOdds={selectedBetTarget?.odds || 1.95}
        balance={balance}
        isBettingClosed={isBettingClosed}
      />

      {/* Cloudflare Remote Management & How It Works Modal */}
      <HowItWorksModal
        isOpen={isHowItWorksOpen}
        onClose={() => setIsHowItWorksOpen(false)}
      />
    </div>
  );
}
