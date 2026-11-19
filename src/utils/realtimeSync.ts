import { DrawResult, BetHistoryRecord, TransactionRecord, TransactionStatus, PlayerAccount } from '../types';
import { apiUrl, getWsUrl, parseJsonSafe } from './apiConfig';

export interface GameServerState {
  currentRoundIndex: number;
  currentRoundTime: string;
  countdown: number;
  roundEndTimestamp?: number;
  serverNow?: number;
  isRevealing: boolean;
  revealStep: number;
  drawMix: number[];
  forcedWinningNumber: number | null;
  pendingWinningResult: DrawResult | null;
  history: DrawResult[];
  balance: number;
  authenticatedPlayer?: PlayerAccount | null;
  recentBets: BetHistoryRecord[];
  transactions: TransactionRecord[];
  isBettingClosed: boolean;
  isRoundPaused?: boolean;
  playerBalances?: Record<string, number>;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'fallback_polling' | 'disconnected';
export type PortalMode = 'player' | 'admin';

export type RealtimeEventHandler = (state: Partial<GameServerState>, eventType?: string, rawMsg?: any) => void;
export type StatusEventHandler = (status: ConnectionStatus) => void;

export const PLAYER_TOKEN_STORAGE_KEY = 'l12kh_player_auth_token_v1';
export const ADMIN_TOKEN_STORAGE_KEY = 'l12kh_admin_auth_token_v1';

export function getPlayerToken(): string | null {
  try {
    return localStorage.getItem(PLAYER_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setPlayerToken(token: string | null) {
  try {
    if (token) localStorage.setItem(PLAYER_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(PLAYER_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function buildAuthHeaders(isAdmin = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (isAdmin) {
    const adminToken = getAdminToken();
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken;
      headers['Authorization'] = `Bearer ${adminToken}`;
    }
  } else {
    const playerToken = getPlayerToken();
    if (playerToken) {
      headers['X-Player-Token'] = playerToken;
      headers['Authorization'] = `Bearer ${playerToken}`;
    }
  }
  return headers;
}

class RealtimeSyncService {
  private socket: WebSocket | null = null;
  private listeners: Set<RealtimeEventHandler> = new Set();
  private statusListeners: Set<StatusEventHandler> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private isConnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackPollerTimer: ReturnType<typeof setInterval> | null = null;
  private currentStatus: ConnectionStatus = 'disconnected';
  private portalMode: PortalMode = 'player';

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        // Strictly public round/draw synchronization channel — NEVER relays private player data
        this.broadcastChannel = new BroadcastChannel('cambodia_lottery_public_round_sync_v2');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.state) {
            const safePublicState: Partial<GameServerState> = {};
            const s = event.data.state as Partial<GameServerState>;
            if (s.countdown !== undefined) safePublicState.countdown = s.countdown;
            if (s.currentRoundIndex !== undefined) safePublicState.currentRoundIndex = s.currentRoundIndex;
            if (s.roundEndTimestamp !== undefined) safePublicState.roundEndTimestamp = s.roundEndTimestamp;
            if (s.serverNow !== undefined) safePublicState.serverNow = s.serverNow;
            if (s.isBettingClosed !== undefined) safePublicState.isBettingClosed = s.isBettingClosed;
            if (s.isRevealing !== undefined) safePublicState.isRevealing = s.isRevealing;
            if (s.revealStep !== undefined) safePublicState.revealStep = s.revealStep;
            if (s.pendingWinningResult !== undefined) safePublicState.pendingWinningResult = s.pendingWinningResult;
            if (s.drawMix !== undefined) safePublicState.drawMix = s.drawMix;
            if (s.history !== undefined) safePublicState.history = s.history;
            this.notifyListeners(safePublicState, event.data.type, event.data.rawMsg);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported', e);
      }
    }
  }

  public setPortalMode(mode: PortalMode) {
    this.portalMode = mode;
    this.sendSocketAuth();
  }

  public reauthenticateSocket(mode?: PortalMode) {
    if (mode) {
      this.portalMode = mode;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendSocketAuth();
    } else {
      this.connect(this.portalMode);
    }
  }

  private sendSocketAuth() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(
        JSON.stringify({
          type: 'AUTH',
          portalMode: this.portalMode,
          playerToken: this.portalMode === 'player' ? getPlayerToken() : null,
          adminToken: this.portalMode === 'admin' ? getAdminToken() : null,
        })
      );
    } catch {
      // ignore send errors on closing socket
    }
  }

  public subscribe(handler: RealtimeEventHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public subscribeStatus(handler: StatusEventHandler): () => void {
    this.statusListeners.add(handler);
    handler(this.currentStatus);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  public getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  private setStatus(status: ConnectionStatus) {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.statusListeners.forEach((l) => {
        try {
          l(status);
        } catch (e) {
          console.error(e);
        }
      });
    }
  }

  private notifyListeners(partial: Partial<GameServerState>, eventType?: string, rawMsg?: any) {
    this.listeners.forEach((listener) => {
      try {
        listener(partial, eventType, rawMsg);
      } catch (e) {
        console.error('Error in realtime listener', e);
      }
    });
  }

  public connect(mode?: PortalMode) {
    if (typeof window === 'undefined') return;
    if (mode) {
      this.portalMode = mode;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendSocketAuth();
      return;
    }
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.setStatus('connecting');

    const baseWsUrl = getWsUrl();
    const separator = baseWsUrl.includes('?') ? '&' : '?';
    const wsUrl = `${baseWsUrl}${separator}portal=${encodeURIComponent(this.portalMode)}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnecting = false;
        this.setStatus('connected');
        this.stopFallbackPoller();
        this.sendSocketAuth();
      };

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingEvent(msg);
        } catch (e) {
          console.warn('Failed to parse incoming WS message', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        this.socket = null;
        this.setStatus('fallback_polling');
        this.startFallbackPoller();
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        this.isConnecting = false;
        this.setStatus('fallback_polling');
        this.startFallbackPoller();
      };
    } catch {
      this.isConnecting = false;
      this.setStatus('fallback_polling');
      this.startFallbackPoller();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2500);
  }

  private startFallbackPoller() {
    if (this.fallbackPollerTimer) return;
    this.fallbackPollerTimer = setInterval(async () => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.stopFallbackPoller();
        return;
      }
      await this.fetchInitialState();
    }, 1500);
  }

  private stopFallbackPoller() {
    if (this.fallbackPollerTimer) {
      clearInterval(this.fallbackPollerTimer);
      this.fallbackPollerTimer = null;
    }
  }

  private handleIncomingEvent(msg: { type: string; [key: string]: any }) {
    switch (msg.type) {
      case 'INIT_STATE':
        if (msg.payload) {
          this.notifyListeners(msg.payload, 'INIT_STATE', msg);
        }
        break;

      case 'TICK':
        this.notifyListeners(
          {
            countdown: msg.countdown,
            currentRoundIndex: msg.currentRoundIndex,
            roundEndTimestamp: msg.roundEndTimestamp,
            serverNow: msg.serverNow,
            isBettingClosed: msg.isBettingClosed,
            isRoundPaused: msg.isRoundPaused,
          },
          'TICK',
          msg
        );
        break;

      case 'COUNTDOWN_10S_START':
        this.notifyListeners(
          {
            countdown: msg.countdown ?? 10,
            currentRoundIndex: msg.currentRoundIndex,
            roundEndTimestamp: msg.roundEndTimestamp,
            serverNow: msg.serverNow,
            isBettingClosed: true,
          },
          'COUNTDOWN_10S_START',
          msg
        );
        this.broadcastPublicLocally(
          {
            countdown: msg.countdown ?? 10,
            roundEndTimestamp: msg.roundEndTimestamp,
            serverNow: msg.serverNow,
            isBettingClosed: true,
          },
          'COUNTDOWN_10S_START'
        );
        break;

      case 'FORCED_RESULT_UPDATED':
        this.notifyListeners(
          {
            forcedWinningNumber: msg.forcedWinningNumber,
          },
          'FORCED_RESULT_UPDATED',
          msg
        );
        break;

      case 'DRAW_STARTED':
        this.notifyListeners(
          {
            isRevealing: true,
            revealStep: msg.revealStep ?? 1,
            pendingWinningResult: msg.outcomeResult,
            drawMix: msg.drawMix,
            countdown: 0,
            isBettingClosed: true,
          },
          'DRAW_STARTED',
          msg
        );
        this.broadcastPublicLocally(
          {
            isRevealing: true,
            revealStep: msg.revealStep ?? 1,
            pendingWinningResult: msg.outcomeResult,
            drawMix: msg.drawMix,
          },
          'DRAW_STARTED'
        );
        break;

      case 'DRAW_STEP':
        this.notifyListeners(
          {
            revealStep: msg.revealStep,
            isRevealing: true,
          },
          'DRAW_STEP',
          msg
        );
        break;

      case 'DRAW_FINISHED':
        this.notifyListeners(
          {
            isRevealing: true,
            revealStep: 12,
            pendingWinningResult: msg.outcomeResult,
            history: msg.newHistory,
            ...(msg.recentBets !== undefined ? { recentBets: msg.recentBets } : {}),
            ...(msg.newBalance !== undefined ? { balance: msg.newBalance } : {}),
            ...(msg.playerBalances !== undefined ? { playerBalances: msg.playerBalances } : {}),
          },
          'DRAW_FINISHED',
          msg
        );
        this.broadcastPublicLocally(
          {
            history: msg.newHistory,
          },
          'HISTORY_UPDATED'
        );
        break;

      case 'ROUND_RESET':
        this.notifyListeners(
          {
            isRevealing: false,
            revealStep: 0,
            pendingWinningResult: null,
            countdown: msg.countdown ?? 180,
            currentRoundIndex: msg.currentRoundIndex,
            roundEndTimestamp: msg.roundEndTimestamp,
            serverNow: msg.serverNow,
            drawMix: msg.drawMix,
            isBettingClosed: false,
          },
          'ROUND_RESET',
          msg
        );
        this.broadcastPublicLocally(
          {
            currentRoundIndex: msg.currentRoundIndex,
            countdown: msg.countdown ?? 180,
            roundEndTimestamp: msg.roundEndTimestamp,
            serverNow: msg.serverNow,
          },
          'ROUND_RESET'
        );
        break;

      case 'BET_PLACED':
        this.notifyListeners(
          {
            ...(msg.recentBets !== undefined ? { recentBets: msg.recentBets } : {}),
            ...(msg.newBalance !== undefined ? { balance: msg.newBalance } : {}),
            ...(msg.playerBalances !== undefined ? { playerBalances: msg.playerBalances } : {}),
          },
          'BET_PLACED',
          msg
        );
        break;

      case 'TRANSACTION_UPDATED':
        this.notifyListeners(
          {
            ...(msg.transactions !== undefined ? { transactions: msg.transactions } : {}),
            ...(msg.newBalance !== undefined ? { balance: msg.newBalance } : {}),
            ...(msg.playerBalances !== undefined ? { playerBalances: msg.playerBalances } : {}),
          },
          'TRANSACTION_UPDATED',
          msg
        );
        break;

      case 'BALANCE_UPDATED':
        this.notifyListeners(
          {
            ...(msg.newBalance !== undefined ? { balance: msg.newBalance } : {}),
            ...(msg.playerBalances !== undefined ? { playerBalances: msg.playerBalances } : {}),
          },
          'BALANCE_UPDATED',
          msg
        );
        break;

      case 'PLAYER_UPDATED':
        this.notifyListeners(
          {
            ...(msg.playerBalances !== undefined ? { playerBalances: msg.playerBalances } : {}),
          },
          'PLAYER_UPDATED',
          msg
        );
        break;

      case 'HISTORY_UPDATED':
        this.notifyListeners({ history: msg.history }, 'HISTORY_UPDATED', msg);
        this.broadcastPublicLocally({ history: msg.history }, 'HISTORY_UPDATED');
        break;

      case 'SESSION_REVOKED':
        this.notifyListeners({}, 'SESSION_REVOKED', msg);
        break;

      case 'AUDIT_LOG_ADDED':
        this.notifyListeners({}, 'AUDIT_LOG_ADDED', msg);
        break;
    }
  }

  private broadcastPublicLocally(state: Partial<GameServerState>, type: string) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ state, type });
      } catch {
        // Ignore
      }
    }
  }

  public async fetchInitialState(isAdmin?: boolean): Promise<GameServerState | null> {
    const adminMode = isAdmin ?? this.portalMode === 'admin';
    try {
      const path = adminMode ? '/api/state?portal=admin' : '/api/state';
      const res = await fetch(apiUrl(path), {
        headers: buildAuthHeaders(adminMode),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await parseJsonSafe<GameServerState>(res);
        if (data) {
          this.notifyListeners(data, 'INIT_STATE');
          return data;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch state via HTTP', e);
    }
    return null;
  }

  public async setForcedResult(number: number | null) {
    try {
      await fetch(apiUrl('/api/admin/set-result'), {
        method: 'POST',
        headers: buildAuthHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ number }),
      });
    } catch (e) {
      console.warn('HTTP fallback failed for setForcedResult', e);
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'SET_FORCED_RESULT',
          token: getAdminToken(),
          payload: { number },
        })
      );
    }
  }

  public async forceDrawNow(targetNumber?: number, withCountdown: boolean = false) {
    try {
      await fetch(apiUrl('/api/admin/force-draw'), {
        method: 'POST',
        headers: buildAuthHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ targetNumber, withCountdown }),
      });
    } catch (e) {
      console.warn('HTTP fallback failed for forceDrawNow', e);
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: 'FORCE_DRAW_NOW',
          token: getAdminToken(),
          payload: { targetNumber },
        })
      );
    }
  }

  public async placeBet(betRecord: BetHistoryRecord) {
    try {
      const res = await fetch(apiUrl('/api/bet'), {
        method: 'POST',
        headers: buildAuthHeaders(false),
        credentials: 'include',
        body: JSON.stringify({ betRecord }),
      });
      return await parseJsonSafe(res);
    } catch (e) {
      console.warn('Failed to post bet', e);
    }
  }

  public async createTransaction(tx: Omit<TransactionRecord, 'id' | 'timestamp' | 'timeString'>) {
    try {
      const isAdminCall = this.portalMode === 'admin' && Boolean(getAdminToken());
      const res = await fetch(apiUrl('/api/transaction'), {
        method: 'POST',
        headers: buildAuthHeaders(isAdminCall),
        credentials: 'include',
        body: JSON.stringify(tx),
      });
      return await parseJsonSafe(res);
    } catch (e) {
      console.warn('Failed to post transaction', e);
    }
  }

  public async updateTransactionStatus(id: string, status: TransactionStatus) {
    try {
      const res = await fetch(apiUrl(`/api/transaction/${id}/status`), {
        method: 'POST',
        headers: buildAuthHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      return await parseJsonSafe(res);
    } catch (e) {
      console.warn('Failed to update transaction status', e);
    }
  }

  public async addManualResult(result: DrawResult) {
    try {
      await fetch(apiUrl('/api/admin/manual-result'), {
        method: 'POST',
        headers: buildAuthHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ result }),
      });
    } catch (e) {
      console.warn('Failed to add manual result', e);
    }
  }

  public async deleteResult(roundId: string) {
    try {
      await fetch(apiUrl(`/api/admin/result/${encodeURIComponent(roundId)}`), {
        method: 'DELETE',
        headers: buildAuthHeaders(true),
        credentials: 'include',
      });
    } catch (e) {
      console.warn('Failed to delete result', e);
    }
  }
}

export const realtimeSync = new RealtimeSyncService();
