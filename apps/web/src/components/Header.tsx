import { useState } from 'react';
import { Download, Info, Moon, Sun, Target, Trophy, X } from 'lucide-react';
import calfracLogo from '../assets/calfrac-logo.png';

import { useDarkMode } from '../hooks/useDarkMode';
import { useGoalsPopupStore } from '../state/useGoalsPopupStore';
import { useUserStore } from '../state/useUserStore';
import { Scoreboard } from './Scoreboard';
import { SpareMark } from './ui/SpareMark';

export function Header() {
  const [infoOpen, setInfoOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [dark, setDark] = useDarkMode();
  const currentUser = useUserStore((s) => s.currentUser);
  const setGoalsOpen = useGoalsPopupStore((s) => s.setOpen);

  return (
    <header className="flex shrink-0 items-center gap-3 bg-primaryDeep px-6 py-4">
      <img src={calfracLogo} alt="Calfrac" className="h-10 w-10 shrink-0 object-contain" />
      <span aria-hidden="true" className="h-8 w-px shrink-0 bg-white/20" />
      {/* Drawn in white and orange straight onto the green — no light chip needed, which
          is the whole point of it being vector rather than a flat navy image. */}
      <SpareMark className="h-9 w-9 shrink-0" frame="#ffffff" title="SPARE" />
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-none tracking-[0.22em] text-white">SPARE</h1>
        <p className="mt-1 hidden text-[10px] font-medium uppercase leading-tight tracking-[0.12em] text-white/55 sm:block">
          Surplus Parts &amp; Asset Recovery Exchange
        </p>
      </div>
      {currentUser && (
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
          aria-label="Goals"
          title="Goals"
        >
          <Target size={20} />
        </button>
      )}
      <button
        type="button"
        onClick={() => setScoreboardOpen(true)}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 ${currentUser ? '' : 'ml-auto'}`}
        aria-label="Scoreboard"
        title="Scoreboard"
      >
        <Trophy size={20} />
      </button>
      {/* A plain link, not a fetch: the endpoint sends Content-Disposition: attachment, so
          the browser saves it directly and never has to hold the whole file in memory. */}
      <a
        href="/api/export"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
        aria-label="Export all data to a spreadsheet"
        title="Export all data to a spreadsheet"
      >
        <Download size={20} />
      </a>
      <button
        type="button"
        onClick={() => setDark((d) => !d)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
        aria-label="Info"
      >
        <Info size={20} />
      </button>

      {scoreboardOpen && <Scoreboard onClose={() => setScoreboardOpen(false)} />}

      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-card bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-textPri">Inventory Workflow</h2>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-primary text-primary hover:bg-surfaceMuted"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-sm text-textPri">
              <p>
                <span className="font-semibold">Not Started</span> — No processing checkpoints have been completed yet.
              </p>
              <p>
                <span className="font-semibold">Processing</span> — At least one checkpoint is complete: Photographed,
                Qty Confirmed, Condition, Transferred, or eBay Listed.
              </p>
              <p>
                <span className="font-semibold">Completed</span> — All five checkpoints are satisfied and the part is
                listing-ready.
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
