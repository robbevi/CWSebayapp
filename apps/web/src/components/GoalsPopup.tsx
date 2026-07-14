import { useEffect } from 'react';
import { PartyPopper, Target, X } from 'lucide-react';
import { GOALS } from '@warehouse/shared';
import { useSubmissionSummary } from '../hooks/useSubmissionSummary';
import { useGoalsPopupStore } from '../state/useGoalsPopupStore';
import { useUserStore } from '../state/useUserStore';

const SHOWN_KEY = 'goalsPopupShownDate';

function ProgressBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  const met = value >= goal;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-textMuted">{label}</span>
        <span className={met ? 'font-semibold text-primary' : 'text-textMuted'}>
          {value} / {goal}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-pill bg-surfaceMuted">
        <div className={`h-full rounded-pill ${met ? 'bg-primary' : 'bg-primary/60'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function GoalsPopup() {
  const currentUser = useUserStore((s) => s.currentUser);
  const { open, setOpen } = useGoalsPopupStore();
  const { data: summary } = useSubmissionSummary();

  // Auto-open once per calendar day, the first time we know who's using the app.
  useEffect(() => {
    if (!currentUser) return;
    const today = new Date().toDateString();
    if (localStorage.getItem(SHOWN_KEY) !== today) {
      localStorage.setItem(SHOWN_KEY, today);
      setOpen(true);
    }
  }, [currentUser, setOpen]);

  if (!open || !currentUser) return null;

  const mine = summary?.find((s) => s.user === currentUser);
  const day = mine?.day ?? 0;
  const week = mine?.week ?? 0;
  const month = mine?.month ?? 0;
  const dayMet = day >= GOALS.day;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-card bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-textPri">Your progress</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-btn p-1 hover:bg-surfaceMuted"
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {dayMet && (
          <div className="celebrate-pop mb-4 flex items-center gap-2 rounded-btn bg-primary/10 p-3 text-sm font-medium text-primary">
            <PartyPopper size={18} />
            Daily goal hit — nice work, {currentUser.split(' ')[0]}!
          </div>
        )}

        <div className="space-y-4">
          <ProgressBar label="Today" value={day} goal={GOALS.day} />
          <ProgressBar label="This week" value={week} goal={GOALS.week} />
          <ProgressBar label="This month" value={month} goal={GOALS.month} />
        </div>
      </div>
    </div>
  );
}
