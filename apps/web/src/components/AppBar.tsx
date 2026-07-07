import { Info, Share2 } from 'lucide-react';
import { Button } from './ui/Button';

export function AppBar() {
  return (
    <header className="flex h-14 items-center justify-between bg-primaryDeep px-6 text-white">
      <div className="flex items-center gap-2 font-semibold">
        <Info size={18} />
        Inventory Workflow
      </div>
      <Button variant="outline" className="border-white/40 text-white hover:bg-white/10">
        <Share2 size={16} />
        Share
      </Button>
    </header>
  );
}
