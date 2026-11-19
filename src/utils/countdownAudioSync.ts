// Authoritative Clock-Synchronized Countdown Audio Controller for Lottery12KH
// Uses the user's original recording: /assets/aistudio/tts_c3510720_e0f87616.mp3

export interface CountdownSyncSegment {
  number: number; // 10 down to 0
  khmerWord: string; // «ដប់», «ប្រាំបួន», ..., «សូមសំណាងល្អ»
  romanized: string; // Dop, Pram Buon, ..., Som Samnang Laor
  khmerDigit: string; // ១០, ៩, ..., ០
  start: number; // nominal seconds
  end: number; // nominal seconds
  cueStart: number; // exact spoken audio onset in MP3 (seconds)
  cueEnd: number; // exact spoken audio offset in MP3 (seconds)
}

export const COUNTDOWN_AUDIO_URL = '/assets/aistudio/tts_c3510720_e0f87616.mp3';

// Exact cue boundaries verified directly against /public/assets/aistudio/tts_c3510720_e0f87616.mp3
export const COUNTDOWN_SEGMENTS: CountdownSyncSegment[] = [
  { number: 10, khmerWord: '«ដប់»', romanized: 'Dop', khmerDigit: '១០', start: 0.0, end: 1.0, cueStart: 0.20, cueEnd: 0.85 },
  { number: 9, khmerWord: '«ប្រាំបួន»', romanized: 'Pram Buon', khmerDigit: '៩', start: 1.0, end: 2.0, cueStart: 1.34, cueEnd: 2.10 },
  { number: 8, khmerWord: '«ប្រាំបី»', romanized: 'Pram Bei', khmerDigit: '៨', start: 2.0, end: 3.0, cueStart: 2.88, cueEnd: 3.60 },
  { number: 7, khmerWord: '«ប្រាំពីរ»', romanized: 'Pram Pir', khmerDigit: '៧', start: 3.0, end: 4.0, cueStart: 4.42, cueEnd: 5.16 },
  { number: 6, khmerWord: '«ប្រាំមួយ»', romanized: 'Pram Muoy', khmerDigit: '៦', start: 4.0, end: 5.0, cueStart: 5.95, cueEnd: 6.70 },
  { number: 5, khmerWord: '«ប្រាំ»', romanized: 'Pram', khmerDigit: '៥', start: 5.0, end: 6.0, cueStart: 7.49, cueEnd: 8.05 },
  { number: 4, khmerWord: '«បួន»', romanized: 'Buon', khmerDigit: '៤', start: 6.0, end: 7.0, cueStart: 8.86, cueEnd: 9.36 },
  { number: 3, khmerWord: '«បី»', romanized: 'Bei', khmerDigit: '៣', start: 7.0, end: 8.0, cueStart: 10.12, cueEnd: 10.58 },
  { number: 2, khmerWord: '«ពីរ»', romanized: 'Pir', khmerDigit: '២', start: 8.0, end: 9.0, cueStart: 11.37, cueEnd: 11.80 },
  { number: 1, khmerWord: '«មួយ»', romanized: 'Muoy', khmerDigit: '១', start: 9.0, end: 10.0, cueStart: 12.58, cueEnd: 13.10 },
  { number: 0, khmerWord: '«សូមសំណាងល្អ»', romanized: 'Som Samnang Laor', khmerDigit: '០', start: 10.0, end: 11.1, cueStart: 13.89, cueEnd: 15.05 },
];

export function getSegmentForCountdownNumber(num: number): CountdownSyncSegment {
  const clamped = Math.max(0, Math.min(10, Math.round(num)));
  return (
    COUNTDOWN_SEGMENTS.find((seg) => seg.number === clamped) ||
    COUNTDOWN_SEGMENTS[COUNTDOWN_SEGMENTS.length - 1]
  );
}

export function getSegmentForTime(currentTime: number): CountdownSyncSegment {
  for (const seg of COUNTDOWN_SEGMENTS) {
    if (currentTime >= seg.start && currentTime < seg.end) {
      return seg;
    }
  }
  return COUNTDOWN_SEGMENTS[COUNTDOWN_SEGMENTS.length - 1];
}

export interface AuthoritativeSyncParams {
  roundIndex: number;
  roundEndTimestamp: number;
  serverOffsetMs: number;
  isRevealing: boolean;
  isPaused: boolean;
  isMuted: boolean;
  onSegmentUpdate?: (segment: CountdownSyncSegment | null, countdownNumber: number) => void;
}

class CountdownAudioController {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private loadingPromise: Promise<AudioBuffer | null> | null = null;
  private activeSource: AudioBufferSourceNode | null = null;

  // Fallback HTMLAudioElement if Web Audio decode is unavailable or still loading
  private fallbackAudio: HTMLAudioElement | null = null;
  private fallbackCueStopTimer: ReturnType<typeof setTimeout> | null = null;

  private active: boolean = false;
  private lastPlayedCueKey: string | null = null;
  private lastRoundIndex: number | null = null;
  private muted: boolean = false;

  // Offline / standalone fallback timer state
  private offlineIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.fallbackAudio = new Audio(COUNTDOWN_AUDIO_URL);
        this.fallbackAudio.preload = 'auto';

        const unlockAudio = () => {
          this.ensureContext();
          if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
          }
          if (this.fallbackAudio) {
            this.fallbackAudio.load();
          }
          this.preloadBuffer();
        };

        window.addEventListener('pointerdown', unlockAudio, { passive: true });
        window.addEventListener('keydown', unlockAudio, { passive: true });
        window.addEventListener('touchstart', unlockAudio, { passive: true });

        // Begin fetching and decoding original MP3 upfront
        this.preloadBuffer();
      } catch (e) {
        console.warn('CountdownAudioController initialization warning:', e);
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = this.muted ? 0 : 1;
        this.gainNode.connect(this.audioCtx.destination);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public preloadBuffer(): Promise<AudioBuffer | null> {
    if (this.audioBuffer) return Promise.resolve(this.audioBuffer);
    if (this.loadingPromise) return this.loadingPromise;
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      return Promise.resolve(null);
    }

    this.loadingPromise = fetch(COUNTDOWN_AUDIO_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(async (arr) => {
        const ctx = this.ensureContext();
        if (!ctx) return null;
        const decoded = await ctx.decodeAudioData(arr);
        this.audioBuffer = decoded;
        return decoded;
      })
      .catch((err) => {
        console.warn('Could not preload countdown MP3 into WebAudio:', err);
        this.loadingPromise = null;
        return null;
      });

    return this.loadingPromise;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.gainNode && this.audioCtx) {
      try {
        this.gainNode.gain.setValueAtTime(muted ? 0 : 1, this.audioCtx.currentTime);
      } catch {
        this.gainNode.gain.value = muted ? 0 : 1;
      }
    }
    if (this.fallbackAudio) {
      this.fallbackAudio.muted = muted;
      this.fallbackAudio.volume = muted ? 0 : 1;
    }
  }

  public isRunning(): boolean {
    return this.active;
  }

  private stopActiveAudioOnly() {
    if (this.activeSource) {
      try {
        this.activeSource.onended = null;
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // already stopped
      }
      this.activeSource = null;
    }
    if (this.fallbackCueStopTimer) {
      clearTimeout(this.fallbackCueStopTimer);
      this.fallbackCueStopTimer = null;
    }
    if (this.fallbackAudio) {
      try {
        this.fallbackAudio.pause();
      } catch {
        // ignore
      }
    }
  }

  private playCueSlice(segment: CountdownSyncSegment, offsetWithinSlotSec: number) {
    // Prevent duplicate or overlapping playback unconditionally
    this.stopActiveAudioOnly();

    const cueTotalDuration = Math.max(0.05, segment.cueEnd - segment.cueStart);
    const startOffsetInCue = Math.max(0, offsetWithinSlotSec);
    if (startOffsetInCue >= cueTotalDuration - 0.1) {
      // Already past the spoken portion of this digit (e.g. tab resumed right before next digit)
      return;
    }

    const playbackOffset = segment.cueStart + startOffsetInCue;
    const playbackDuration = Math.max(0.05, cueTotalDuration - startOffsetInCue);

    const ctx = this.ensureContext();
    if (ctx && this.audioBuffer && this.gainNode) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      try {
        const source = ctx.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(this.gainNode);
        this.activeSource = source;
        source.onended = () => {
          if (this.activeSource === source) {
            this.activeSource = null;
          }
        };
        source.start(0, playbackOffset, playbackDuration);
        return;
      } catch (e) {
        console.warn('WebAudio cue slice playback error, using HTMLAudio fallback:', e);
      }
    } else {
      // Trigger decode for subsequent digits
      this.preloadBuffer();
    }

    // Fallback to HTMLAudioElement using exact cue offset from the original MP3
    if (this.fallbackAudio) {
      try {
        this.fallbackAudio.muted = this.muted;
        this.fallbackAudio.volume = this.muted ? 0 : 1;
        this.fallbackAudio.currentTime = playbackOffset;
        const p = this.fallbackAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
        this.fallbackCueStopTimer = setTimeout(() => {
          if (this.fallbackAudio) {
            this.fallbackAudio.pause();
          }
          this.fallbackCueStopTimer = null;
        }, Math.round(playbackDuration * 1000));
      } catch {
        // ignore autoplay restrictions before gesture
      }
    }
  }

  /**
   * Authoritative clock-driven synchronization:
   * Evaluates remaining time from `roundEndTimestamp - (Date.now() + serverOffsetMs)`
   * and triggers the matching Khmer audio segment for 10..0 cleanly without drift or overlap.
   */
  public syncToAuthoritativeTime(params: AuthoritativeSyncParams): {
    active: boolean;
    countdown: number;
    segment: CountdownSyncSegment | null;
  } {
    const {
      roundIndex,
      roundEndTimestamp,
      serverOffsetMs,
      isRevealing,
      isPaused,
      isMuted,
      onSegmentUpdate,
    } = params;

    this.setMuted(isMuted);

    if (this.lastRoundIndex !== roundIndex) {
      this.lastRoundIndex = roundIndex;
      this.lastPlayedCueKey = null;
    }

    const authoritativeNow = Date.now() + serverOffsetMs;
    const remainingMs = roundEndTimestamp - authoritativeNow;
    const countdown = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;

    // Outside the 10s..0s countdown window or after countdown finished / paused / revealing -> stop all audio
    if (isRevealing || isPaused || remainingMs > 10000 || remainingMs <= -1100) {
      if (this.active || this.activeSource) {
        this.active = false;
        this.stopActiveAudioOnly();
        onSegmentUpdate?.(null, countdown);
      }
      return { active: false, countdown, segment: null };
    }

    this.active = true;
    const clampedNumber = remainingMs > 0 ? Math.min(10, Math.ceil(remainingMs / 1000)) : 0;
    const segment = getSegmentForCountdownNumber(clampedNumber);

    onSegmentUpdate?.(segment, clampedNumber);

    const cueKey = `${roundIndex}:${clampedNumber}`;
    if (this.lastPlayedCueKey !== cueKey) {
      this.lastPlayedCueKey = cueKey;

      // Compute exact offset within the 1-second (or 1.1s for zero) slot so refreshes & background tabs catch up seamlessly
      const slotElapsedSec =
        clampedNumber >= 1
          ? Math.max(0, (clampedNumber * 1000 - remainingMs) / 1000)
          : Math.max(0, -remainingMs / 1000);

      this.playCueSlice(segment, slotElapsedSec);
    }

    return { active: true, countdown: clampedNumber, segment };
  }

  /**
   * Offline/disconnected fallback countdown runner (still driven by wall-clock target timestamp).
   */
  public start(
    onUpdate: (segment: CountdownSyncSegment, currentTime: number) => void,
    onComplete: () => void,
    isMuted: boolean = false,
    roundIndex: number = 0
  ) {
    this.stop();
    this.setMuted(isMuted);
    const targetEnd = Date.now() + 10000;

    const tick = () => {
      const remainingMs = targetEnd - Date.now();
      if (remainingMs <= -1100) {
        this.stop();
        onComplete();
        return;
      }
      const res = this.syncToAuthoritativeTime({
        roundIndex,
        roundEndTimestamp: targetEnd,
        serverOffsetMs: 0,
        isRevealing: false,
        isPaused: false,
        isMuted: this.muted,
        onSegmentUpdate: (seg) => {
          if (seg) {
            onUpdate(seg, (10000 - remainingMs) / 1000);
          }
        },
      });
      if (!res.active && remainingMs <= -1100) {
        this.stop();
        onComplete();
      }
    };

    tick();
    this.offlineIntervalId = setInterval(tick, 100);
  }

  public stop() {
    this.active = false;
    this.lastPlayedCueKey = null;
    if (this.offlineIntervalId) {
      clearInterval(this.offlineIntervalId);
      this.offlineIntervalId = null;
    }
    this.stopActiveAudioOnly();
  }
}

export const countdownAudioSync = new CountdownAudioController();
