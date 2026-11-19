import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, LogIn, AlertTriangle, Globe } from 'lucide-react';
import { AnimalArtwork } from './AnimalIllustrations';
import { ANIMALS_DATA, PlayerAccount } from '../types';
import { setPlayerToken } from '../utils/realtimeSync';
import { apiUrl, parseJsonSafe } from '../utils/apiConfig';
import { sound } from '../utils/sound';

interface PlayerLoginPageProps {
  onLoginSuccess: (player: PlayerAccount, token: string) => void;
}

export const PlayerLoginPage: React.FC<PlayerLoginPageProps> = ({
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lang, setLang] = useState<'km' | 'en'>('km');

  const leftAnimals = [1, 2, 3, 4, 5, 6];
  const rightAnimals = [7, 8, 9, 10, 11, 12];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      sound.playBlocked();
      setErrorMsg(
        lang === 'km'
          ? 'សូមបញ្ចូលឈ្មោះអ្នកប្រើ និងពាក្យសម្ងាត់!'
          : 'Please enter both username and password!'
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/player/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: trimmedUser, password }),
      });

      const data = await parseJsonSafe(res);
      if (!data) {
        sound.playBlocked();
        setErrorMsg(
          lang === 'km'
            ? 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ សូមព្យាយាមម្តងទៀត!'
            : 'Unable to connect to the server. Please try again!'
        );
        setIsLoading(false);
        return;
      }
      if (!res.ok || !data.success) {
        sound.playBlocked();
        if (data.code === 'ACCOUNT_DISABLED') {
          setErrorMsg(
            lang === 'km'
              ? 'គណនីរបស់អ្នកត្រូវបានបិទជាបណ្ដោះអាសន្ន! សូមទាក់ទងអ្នកគ្រប់គ្រង។'
              : 'Your account has been disabled! Please contact the administrator.'
          );
        } else {
          setErrorMsg(
            lang === 'km'
              ? data.error || 'ឈ្មោះឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ!'
              : data.errorEn || 'Invalid username or password!'
          );
        }
        setIsLoading(false);
        return;
      }

      sound.playWin();
      setPlayerToken(data.token);
      onLoginSuccess(data.player, data.token);
    } catch {
      sound.playBlocked();
      setErrorMsg(
        lang === 'km'
          ? 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ សូមព្យាយាមម្តងទៀត!'
          : 'Unable to connect to the server. Please try again!'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getNumberColorClass = (num: number) => {
    const color = ANIMALS_DATA[num]?.color;
    if (color === 'red') return 'text-[#dc2626]';
    if (color === 'green') return 'text-[#15803d]';
    return 'text-[#1d4ed8]';
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden flex flex-col justify-between bg-[#090d24] font-['Kantumruy_Pro',sans-serif] select-none">
      {/* Rich Royal Cambodian Dusk & Golden Palace Background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 22%, rgba(99, 56, 178, 0.55) 0%, rgba(28, 22, 78, 0.88) 48%, rgba(8, 10, 30, 0.98) 100%)',
        }}
      />
      {/* Warm Horizon Glow */}
      <div
        className="fixed inset-x-0 top-[36%] h-64 pointer-events-none z-0 opacity-60 blur-3xl"
        style={{
          background:
            'linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(236,72,153,0.28) 35%, rgba(251,191,36,0.35) 50%, rgba(236,72,153,0.28) 65%, rgba(245,158,11,0.12) 100%)',
        }}
      />
      {/* Subtle Golden Floor Reflection */}
      <div
        className="fixed inset-x-0 bottom-0 h-44 pointer-events-none z-0"
        style={{
          background:
            'linear-gradient(to top, rgba(180, 110, 12, 0.35) 0%, rgba(120, 65, 8, 0.14) 55%, transparent 100%)',
        }}
      />

      {/* Top Navigation / Language Switcher Bar */}
      <div className="relative z-20 w-full max-w-[1400px] mx-auto px-4 sm:px-8 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-600 p-0.5 shadow-md border border-yellow-200/60">
            <img
              src="/assets/aistudio/f8a5d8e0_4k.jpg"
              alt="Lottery12KH"
              className="w-full h-full object-cover rounded-md"
            />
          </div>
          <span className="text-amber-300 font-black tracking-wide text-sm sm:text-base drop-shadow">
            Lottery12KH
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLang((prev) => (prev === 'km' ? 'en' : 'km'))}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#14183b]/90 hover:bg-[#1e2454] border border-amber-400/40 text-white text-xs sm:text-sm font-bold shadow-lg transition-all cursor-pointer"
          >
            <Globe className="w-4 h-4 text-amber-400" />
            <span>{lang === 'km' ? '🇰🇭 ខ្មែរ' : '🇬🇧 English'}</span>
            <span className="text-amber-300 text-[10px]">▼</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Stage: Left 6 Animals | Center Ornate Login Frame | Right 6 Animals */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-3 sm:px-6 py-4">
        <div className="w-full max-w-[1320px] grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* LEFT COLUMN: Animals 1 to 6 */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-2.5 items-start">
            {leftAnimals.map((num) => {
              const animal = ANIMALS_DATA[num];
              return (
                <div
                  key={num}
                  className="w-full max-w-[215px] h-[82px] rounded-xl bg-gradient-to-b from-[#fff3b0] via-[#fde68a] to-[#f59e0b] p-[3px] shadow-[0_6px_20px_rgba(0,0,0,0.45)] border border-yellow-200/80 transition-transform hover:scale-[1.02]"
                >
                  <div className="w-full h-full rounded-[9px] bg-gradient-to-r from-[#fef9c3] via-[#fef08a] to-[#fde047] px-3 py-1.5 flex items-center justify-between">
                    <div className="flex flex-col items-start justify-center leading-tight">
                      <span className={`text-sm font-black ${getNumberColorClass(num)}`}>
                        {animal.khmerName}
                      </span>
                      <span
                        className={`text-3xl font-black tracking-tighter ${getNumberColorClass(num)} drop-shadow-xs`}
                      >
                        {num}
                      </span>
                    </div>
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/80 p-0.5 shadow-inner shrink-0">
                      <AnimalArtwork number={num} className="w-full h-full object-contain" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CENTER COLUMN: Official Lottery12KH Crest & Golden Framed Login Box */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center w-full max-w-[600px] mx-auto">
            {/* Top Emblem / Banner */}
            <div className="relative flex flex-col items-center mb-[-18px] z-20">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1.5 bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-700 shadow-[0_0_40px_rgba(251,191,36,0.6)] border-2 border-yellow-100">
                <img
                  src="/assets/aistudio/f8a5d8e0_4k.jpg"
                  alt="ឆ្នោតសំណាង Lottery12KH"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>

              {/* Ornate Khmer Title & Red/Gold Ribbon */}
              <div className="mt-[-14px] flex flex-col items-center">
                <div className="px-6 py-1 rounded-full bg-gradient-to-r from-red-900 via-red-700 to-red-900 border-2 border-amber-300 shadow-[0_6px_20px_rgba(0,0,0,0.65)]">
                  <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-amber-300 to-amber-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] tracking-wide">
                    ឆ្នោតសំណាង
                  </h1>
                </div>
                <div className="mt-[-6px] px-5 py-0.5 rounded-full bg-gradient-to-r from-amber-600 via-red-700 to-amber-600 border border-yellow-200 shadow-md">
                  <span className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">
                    Lottery12KH
                  </span>
                </div>
              </div>
            </div>

            {/* Golden Framed Login Card */}
            <div className="w-full rounded-[26px] p-[4px] bg-gradient-to-b from-[#fef08a] via-[#f59e0b] to-[#92400e] shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_35px_rgba(245,158,11,0.3)]">
              <div className="w-full rounded-[22px] bg-gradient-to-b from-[#131b4d] via-[#0d1338] to-[#080c26] px-5 sm:px-10 pt-9 pb-8 border border-amber-300/30 relative">
                {/* Card Title Header */}
                <div className="flex items-center justify-center gap-3 mb-6">
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-amber-400/70 to-amber-300" />
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 flex items-center justify-center shadow-sm">
                      <User className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide drop-shadow">
                      {lang === 'km' ? 'ចូលគណនីអ្នកលេង' : 'Player Account Login'}
                    </h2>
                  </div>
                  <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-amber-400/70 to-amber-300" />
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Username Input */}
                  <div className="relative">
                    <div className="flex items-center w-full h-13 sm:h-14 rounded-xl bg-[#0e194d]/90 border border-blue-300/40 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/30 transition-all px-4">
                      <User className="w-5 h-5 text-blue-200/80 shrink-0" />
                      <div className="h-5 w-[1px] bg-blue-300/25 mx-3.5" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        placeholder={
                          lang === 'km'
                            ? 'ឈ្មោះអ្នកប្រើ (Username)'
                            : 'Enter Username'
                        }
                        autoComplete="username"
                        data-testid="player-username-input"
                        className="w-full bg-transparent text-white placeholder-blue-200/65 text-sm sm:text-base font-medium focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="relative">
                    <div className="flex items-center w-full h-13 sm:h-14 rounded-xl bg-[#0e194d]/90 border border-blue-300/40 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/30 transition-all px-4">
                      <Lock className="w-5 h-5 text-blue-200/80 shrink-0" />
                      <div className="h-5 w-[1px] bg-blue-300/25 mx-3.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        placeholder={
                          lang === 'km'
                            ? 'ពាក្យសម្ងាត់ (Password)'
                            : 'Enter Password'
                        }
                        autoComplete="current-password"
                        data-testid="player-password-input"
                        className="w-full bg-transparent text-white placeholder-blue-200/65 text-sm sm:text-base font-medium focus:outline-none pr-2"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        data-testid="player-toggle-password"
                        className="p-1.5 text-blue-200/80 hover:text-amber-300 transition-colors cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Error Message Alert */}
                  {errorMsg && (
                    <div
                      role="alert"
                      data-testid="player-login-error"
                      className="w-full rounded-xl bg-[#4c0f24]/95 border border-rose-500/80 px-4 py-3 flex items-center gap-3 text-white shadow-lg animate-fadeIn"
                    >
                      <div className="w-6 h-6 rounded-md bg-rose-500 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm sm:text-base font-bold text-rose-100">
                        {errorMsg}
                      </span>
                    </div>
                  )}

                  {/* Large Golden Login Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    data-testid="player-login-submit"
                    className="w-full h-13 sm:h-14 mt-2 rounded-xl bg-gradient-to-b from-[#fde047] via-[#f59e0b] to-[#d97706] hover:from-[#fef08a] hover:via-[#fbbf24] hover:to-[#b45309] active:scale-[0.99] text-slate-950 font-black text-lg sm:text-xl shadow-[0_6px_20px_rgba(245,158,11,0.45)] border border-yellow-200 flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <LogIn className="w-6 h-6 stroke-[2.5]" />
                    <span>
                      {isLoading
                        ? lang === 'km'
                          ? 'កំពុងផ្ទៀងផ្ទាត់...'
                          : 'Signing in...'
                        : lang === 'km'
                        ? 'ចូលលេង'
                        : 'Login to Play'}
                    </span>
                  </button>
                </form>

                {/* Authorized Account Notice (No Public Registration) */}
                <div className="mt-5 pt-3 border-t border-blue-400/15 text-center">
                  <p className="text-xs text-blue-200/70">
                    {lang === 'km'
                      ? 'មានតែគណនីដែលបានបង្កើតដោយអ្នកគ្រប់គ្រងប៉ុណ្ណោះទើបអាចចូលលេងបាន។'
                      : 'Only player accounts created by an authorized administrator can log in.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile Animal Strip (for screens < lg) */}
            <div className="grid grid-cols-6 gap-1.5 mt-5 lg:hidden w-full">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                <div
                  key={num}
                  className="rounded-lg bg-gradient-to-b from-[#fef08a] to-[#f59e0b] p-1 flex flex-col items-center shadow-sm"
                >
                  <span className={`text-[11px] font-black ${getNumberColorClass(num)}`}>
                    {num}.{ANIMALS_DATA[num].khmerName}
                  </span>
                  <div className="w-9 h-9 bg-white/85 rounded p-0.5 mt-0.5">
                    <AnimalArtwork number={num} className="w-full h-full object-contain" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: Animals 7 to 12 */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-2.5 items-end">
            {rightAnimals.map((num) => {
              const animal = ANIMALS_DATA[num];
              return (
                <div
                  key={num}
                  className="w-full max-w-[215px] h-[82px] rounded-xl bg-gradient-to-b from-[#fff3b0] via-[#fde68a] to-[#f59e0b] p-[3px] shadow-[0_6px_20px_rgba(0,0,0,0.45)] border border-yellow-200/80 transition-transform hover:scale-[1.02]"
                >
                  <div className="w-full h-full rounded-[9px] bg-gradient-to-r from-[#fef9c3] via-[#fef08a] to-[#fde047] px-3 py-1.5 flex items-center justify-between">
                    <div className="flex flex-col items-start justify-center leading-tight">
                      <span className={`text-sm font-black ${getNumberColorClass(num)}`}>
                        {animal.khmerName}
                      </span>
                      <span
                        className={`text-3xl font-black tracking-tighter ${getNumberColorClass(num)} drop-shadow-xs`}
                      >
                        {num}
                      </span>
                    </div>
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/80 p-0.5 shadow-inner shrink-0">
                      <AnimalArtwork number={num} className="w-full h-full object-contain" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Subtle Security Bar */}
      <div className="relative z-10 py-2.5 text-center text-xs text-amber-200/60 border-t border-amber-500/15 bg-black/30">
        <span>Lottery12KH • ប្រព័ន្ធឆ្នោតសត្វទាំង ១២ ផ្លូវការ • សុវត្ថិភាព និងទំនុកចិត្តខ្ពស់</span>
      </div>
    </div>
  );
};
