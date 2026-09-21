import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Delete, LogIn } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import calfracLogo from '../assets/calfrac-logo.png';
import spareWordmark from '../assets/spare-wordmark-light.png';
import { fetchLoginUsers, login, setUpPin, type LoginUser, type Session } from '../lib/api';

const MIN = 4;
const MAX = 6;

/**
 * Sign-in for shared warehouse tablets: tap your name. Admins then type a PIN on a big
 * keypad — choosing one here the first time — because they can publish to eBay; everyone
 * else is signed straight in.
 */
export function LoginScreen({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const users = useQuery({
    queryKey: ['login-users'],
    queryFn: fetchLoginUsers,
  });
  const [picked, setPicked] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState('');
  // While creating a PIN: the first entry, waiting to be confirmed.
  const [firstEntry, setFirstEntry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const settingUp = !!picked?.canSetUp;

  const reset = (user: LoginUser | null) => {
    setPicked(user);
    setPin('');
    setFirstEntry(null);
    setError(null);
  };

  const submit = useCallback(async () => {
    if (!picked || pin.length < MIN || busy) return;
    setError(null);
    if (settingUp && firstEntry === null) {
      setFirstEntry(pin);
      setPin('');
      return;
    }
    if (settingUp && pin !== firstEntry) {
      setError("Those didn't match. Choose your PIN again.");
      setFirstEntry(null);
      setPin('');
      return;
    }
    setBusy(true);
    try {
      onSignedIn(settingUp ? await setUpPin(picked.name, pin) : await login(picked.name, pin));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }, [picked, pin, busy, settingUp, firstEntry, onSignedIn]);

  const choose = async (user: LoginUser) => {
    if (user.needsPin) {
      reset(user);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onSignedIn(await login(user.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const press = useCallback((digit: string) => setPin((p) => (p.length < MAX ? p + digit : p)), []);
  const back = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // A keyboard works too, for anyone signing in at a desk.
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') void submit();
      else if (e.key === 'Escape') reset(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, press, back, submit]);

  const prompt = settingUp
    ? firstEntry === null
      ? 'Choose a PIN (4–6 digits)'
      : 'Enter it again to confirm'
    : 'Enter your PIN';

  return (
    <div className="flex min-h-screen flex-col bg-surfaceMuted">
      <header className="flex items-center gap-3 bg-primaryDeep px-6 py-4">
        <img src={calfracLogo} alt="Calfrac" className="h-9 w-9 object-contain" />
        <span aria-hidden="true" className="h-8 w-px bg-white/20" />
        <div>
          <img src={spareWordmark} alt="SPARE" className="h-4 w-auto object-contain sm:h-5" />
          <p className="mt-1 text-[11px] font-medium tracking-wide text-white/60">
            Surplus Parts &amp; Asset Recovery Exchange
          </p>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-sm">
          {!picked && (
            <>
              <h1 className="text-lg font-semibold text-textPri">Who&apos;s signing in?</h1>
              <p className="mt-1 text-xs text-textMuted">Tap your name.</p>
              {users.isLoading && <p className="mt-6 text-sm text-textMuted">Loading…</p>}
              {users.error && <p className="mt-6 text-sm text-red-600">{users.error.message}</p>}
              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {users.data?.map((u) => (
                  <button
                    key={u.name}
                    type="button"
                    onClick={() => void choose(u)}
                    disabled={busy}
                    className="rounded-btn border border-border bg-surface px-4 py-3 text-left hover:bg-surfaceMuted disabled:opacity-50"
                  >
                    <span className="block text-sm font-semibold text-textPri">{u.name}</span>
                    {u.canSetUp && <span className="block text-[11px] text-textMuted">Set up your PIN</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {picked && (
            <>
              <button
                type="button"
                onClick={() => reset(null)}
                className="mb-3 flex items-center gap-1 text-xs font-semibold text-primary"
              >
                <ArrowLeft size={14} /> Not you?
              </button>
              <h1 className="text-lg font-semibold text-textPri">{picked.name}</h1>

              <>
                <p className="mt-1 text-xs text-textMuted">{prompt}</p>
                <div className="my-5 flex justify-center gap-3" aria-label={`${pin.length} digits entered`}>
                  {Array.from({ length: Math.max(MIN, pin.length) }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-primary' : 'border-2 border-border'}`}
                    />
                  ))}
                </div>
                {error && <p className="mb-3 text-center text-xs text-red-600">{error}</p>}
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => press(d)}
                      className="h-14 rounded-btn border border-border bg-surface text-xl font-semibold text-textPri hover:bg-surfaceMuted active:bg-border"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={back}
                    aria-label="Delete last digit"
                    className="flex h-14 items-center justify-center rounded-btn text-textMuted hover:bg-surfaceMuted"
                  >
                    <Delete size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => press('0')}
                    className="h-14 rounded-btn border border-border bg-surface text-xl font-semibold text-textPri hover:bg-surfaceMuted active:bg-border"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={pin.length < MIN || busy}
                    aria-label={settingUp && firstEntry === null ? 'Next' : 'Sign in'}
                    className="flex h-14 items-center justify-center rounded-btn bg-primary text-white disabled:opacity-40"
                  >
                    <LogIn size={22} />
                  </button>
                </div>
              </>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
