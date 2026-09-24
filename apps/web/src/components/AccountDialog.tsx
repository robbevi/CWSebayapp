import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, KeyRound, LogOut, ShieldCheck, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { formatDate } from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { adminSetPin, changeMyPin, fetchAdminUsers, logout } from '../lib/api';
import { useSalesStatus } from '../hooks/useSales';
import { useUserStore } from '../state/useUserStore';
import { ListingQueueDialog } from './ListingQueueDialog';
import { ResearchBacklog } from './ResearchBacklog';
import { useToastStore } from '../state/useToastStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

const PIN = /^\d{4,6}$/;

function pinInput(value: string, onChange: (v: string) => void, label: string) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  );
}

/** One row of the admin list: a person, whether they have a PIN, and a way to set it. */
function AdminRow({
  name,
  hasPin,
  setAt,
  setBy,
}: {
  name: string;
  hasPin: boolean;
  setAt: string | null;
  setBy: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!PIN.test(pin)) return;
    setBusy(true);
    try {
      await adminSetPin(name, pin);
      toast(`PIN set for ${name}. Tell them what it is.`);
      setEditing(false);
      setPin('');
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not set the PIN', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border-b border-border py-2 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-textPri">{name}</div>
          <div className="text-[11px] text-textMuted">
            {hasPin
              ? `PIN set ${setAt ? formatDate(setAt) : ''}${setBy && setBy !== name ? ` by ${setBy}` : ''}`
              : 'No PIN yet — cannot sign in'}
          </div>
        </div>
        {!editing && (
          <Button type="button" variant="outline" onClick={() => setEditing(true)} className="shrink-0">
            {hasPin ? 'Reset PIN' : 'Set PIN'}
          </Button>
        )}
      </div>
      {editing && (
        <form onSubmit={save} className="mt-2 flex gap-2">
          <div className="flex-1">{pinInput(pin, setPin, `New PIN for ${name.split(' ')[0]}`)}</div>
          <Button type="submit" disabled={!PIN.test(pin) || busy}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      )}
    </li>
  );
}

/**
 * The signed-in person's account: switch user and, for admins — the only people who sign
 * in with a PIN — change their own or reset another admin's. Opened from the name in the header.
 */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  const session = useUserStore((s) => s.session);
  const setSession = useUserStore((s) => s.setSession);
  const qc = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const admin = !!session?.admin;
  const people = useQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers, enabled: admin });
  const { data: status } = useSalesStatus();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [changingPin, setChangingPin] = useState(false);

  const switchUser = async () => {
    await logout().catch(() => undefined);
    qc.clear();
    setSession(null);
  };

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) {
      toast("The new PINs don't match", 'error');
      return;
    }
    setBusy(true);
    try {
      await changeMyPin(current, next);
      toast('Your PIN is changed');
      setCurrent('');
      setNext('');
      setAgain('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not change your PIN', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!session) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-card bg-surface p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-textPri">{session.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-textMuted">
              {session.role === 'lister' ? 'Lister' : 'Warehouse'}
              {admin && (
                <span className="flex items-center gap-1 font-semibold text-primary">
                  · <ShieldCheck size={12} /> Admin
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-btn p-1 text-textMuted hover:bg-surfaceMuted"
          >
            <X size={18} />
          </button>
        </div>

        <Button type="button" onClick={() => void switchUser()} className="w-full">
          <LogOut size={14} /> Switch user
        </Button>

        {/* Changing a PIN is a once-in-a-while job, so it waits behind its own button
            rather than taking three fields of the panel every time it is opened. */}
        {admin && !changingPin && (
          <button
            type="button"
            onClick={() => setChangingPin(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-btn border border-border px-3 py-2 text-xs font-semibold text-textMuted hover:bg-surfaceMuted hover:text-textPri"
          >
            <KeyRound size={13} /> Change my PIN
          </button>
        )}

        {admin && changingPin && (
          <form onSubmit={change} className="mt-5 space-y-2">
            <div className="flex items-center justify-between gap-1.5 text-xs font-semibold text-textMuted">
              <span className="flex items-center gap-1.5">
                <KeyRound size={13} /> Change my PIN
              </span>
              <button
                type="button"
                onClick={() => setChangingPin(false)}
                className="min-h-0 rounded-btn px-2 py-1 font-semibold text-primary hover:bg-surfaceMuted"
              >
                Cancel
              </button>
            </div>
            {pinInput(current, setCurrent, 'Current PIN')}
            <div className="grid grid-cols-2 gap-2">
              {pinInput(next, setNext, 'New PIN')}
              {pinInput(again, setAgain, 'New PIN again')}
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !PIN.test(current) || !PIN.test(next) || !again}
              className="w-full"
            >
              Change PIN
            </Button>
          </form>
        )}

        {/* Listing a steady number a day, without scheduling them one at a time. */}
        {admin && status?.ebayPublishing && (
          <div className="mt-6">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-textMuted">
              <CalendarClock size={13} /> Schedule listings
            </div>
            <Button type="button" variant="outline" onClick={() => setQueueOpen(true)} className="mt-2 w-full">
              <CalendarClock size={14} /> Plan a batch
            </Button>
          </div>
        )}

        {admin && status?.research && <ResearchBacklog />}

        {admin && (
          <div className="mt-6">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-textMuted">
              <ShieldCheck size={13} /> Manage PINs
            </div>
            <p className="mt-1 text-[11px] text-textMuted">
              Only admins sign in with a PIN. If one forgets theirs, set a new one here and tell them what it is.
            </p>
            {people.isLoading && <p className="mt-2 text-xs text-textMuted">Loading…</p>}
            {people.error && <p className="mt-2 text-xs text-red-600">{people.error.message}</p>}
            <ul className="mt-2">
              {people.data
                ?.filter((p) => p.admin && p.name !== session.name)
                .map((p) => (
                  <AdminRow key={p.name} name={p.name} hasPin={p.hasPin} setAt={p.setAt} setBy={p.setBy} />
                ))}
            </ul>
          </div>
        )}
      </div>
      {queueOpen && <ListingQueueDialog onClose={() => setQueueOpen(false)} />}
    </div>
  );
}
