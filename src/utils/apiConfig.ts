/**
 * Centralized API & WebSocket URL Configuration for Lottery12KH
 *
 * - In local VS Code development (Game Page on 127.0.0.1:3001, Admin Panel on 127.0.0.1:5174 via Vite proxy),
 *   VITE_API_BASE_URL is empty, so requests use same-origin relative paths (/api/* and /ws).
 * - In deployed environments (e.g. Cloudflare Pages frontend -> external HTTPS/WSS backend),
 *   set VITE_API_BASE_URL (e.g. https://api.yourdomain.com) and optionally VITE_WS_URL (e.g. wss://api.yourdomain.com/ws).
 * - Never hardcodes 127.0.0.1 into production browser bundles.
 */

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const rawWsUrl = (import.meta.env.VITE_WS_URL || '').trim();

export const API_BASE_URL = rawApiBase;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!rawApiBase) {
    return normalizedPath;
  }
  return `${rawApiBase}${normalizedPath}`;
}

export function getWsUrl(): string {
  if (rawWsUrl) {
    return rawWsUrl;
  }
  if (rawApiBase) {
    const wsBase = rawApiBase.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsBase}/ws`;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return '/ws';
}

export async function parseJsonSafe<T = any>(res: Response): Promise<T | null> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    try {
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
