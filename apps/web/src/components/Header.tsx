import { Info } from 'lucide-react';
import calfracLogo from '../assets/calfrac-logo.png';

export function Header() {
  return (
    <header className="flex shrink-0 items-center gap-4 bg-primaryDeep px-6 py-6">
      <img src={calfracLogo} alt="Calfrac" className="h-16 w-16 shrink-0 object-contain" />
      <div>
        <h1 className="text-xl font-bold text-white">Calfrac eBay Inventory App</h1>
        <p className="text-xs text-white/80">Inventory search, status tracking, and photo capture for warehouse parts</p>
      </div>
      <button
        type="button"
        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
        aria-label="Info"
      >
        <Info size={20} />
      </button>
    </header>
  );
}
