import { useState } from 'react';
import { Info, Moon, Sun, X } from 'lucide-react';
import calfracLogo from '../assets/calfrac-logo.png';
import { useDarkMode } from '../hooks/useDarkMode';

export function Header() {
  const [infoOpen, setInfoOpen] = useState(false);
  const [dark, setDark] = useDarkMode();

  return (
    <header className="flex shrink-0 items-center gap-3 bg-primaryDeep px-6 py-4">
      <img src={calfracLogo} alt="Calfrac" className="h-12 w-12 shrink-0 object-contain" />
      <div>
        <h1 className="text-xl font-bold text-white">Calfrac eBay Inventory App</h1>
        <p className="text-xs text-white/80">Inventory search, status tracking, and photo capture for warehouse parts</p>
      </div>
      <button
        type="button"
        onClick={() => setDark((d) => !d)}
        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
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
