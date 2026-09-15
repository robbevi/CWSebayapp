import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  Camera,
  ClipboardList,
  DollarSign,
  Download,
  Eye,
  Factory,
  Flag,
  Info,
  Layers,
  MapPin,
  Moon,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Signal,
  Sun,
  Tag,
  Target,
  Trophy,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import calfracLogo from '../assets/calfrac-logo.png';
import spareWordmark from '../assets/spare-wordmark-light.png';

import { useDarkMode } from '../hooks/useDarkMode';
import { useGoalsPopupStore } from '../state/useGoalsPopupStore';
import { useSalesStatus, useSyncSales } from '../hooks/useSales';
import { useUserStore } from '../state/useUserStore';
import { Scoreboard } from './Scoreboard';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-textMuted">{title}</h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

/** One glossary entry: the mark as it appears on a card, then what it means. */
function Row({ icon, term, children }: { icon: React.ReactNode; term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-textMuted">{icon}</span>
      <dt className="w-28 shrink-0 font-semibold text-textPri">{term}</dt>
      <dd className="m-0 flex-1 text-textMuted">{children}</dd>
    </div>
  );
}

/** "Richard Radway" becomes RR — enough to recognise yourself at a glance on a phone. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Header() {
  const [infoOpen, setInfoOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [dark, setDark] = useDarkMode();
  const currentUser = useUserStore((s) => s.currentUser);
  const startSwitch = useUserStore((s) => s.startSwitch);
  const setGoalsOpen = useGoalsPopupStore((s) => s.setOpen);
  const { data: salesStatus } = useSalesStatus();
  const syncSales = useSyncSales();

  return (
    <header className="flex shrink-0 items-center gap-1 bg-primaryDeep px-3 py-4 sm:gap-3 sm:px-6">
      <img src={calfracLogo} alt="Calfrac" className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10" />
      <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-white/20 sm:block" />
      {/* shrink-0 rather than min-w-0: a flex-squashed wordmark renders as a stray few
          pixels rather than getting smaller. */}
      <div className="shrink-0">
        {/* The wordmark is the lettering from the supplied logo, lifted out and recoloured
            white so it reads on the green — the navy original would disappear. The orange
            A is kept as drawn. An image rather than type, because the face is bespoke. */}
        <img src={spareWordmark} alt="SPARE" className="h-3 w-auto object-contain sm:h-5" />
        <p className="mt-1 hidden text-[11px] font-medium leading-tight tracking-wide text-white/60 sm:block">
          Surplus Parts &amp; Asset Recovery Exchange
        </p>
      </div>
      {/* Who the work is being credited to, and the way to change it. These are shared
          warehouse tablets — whoever picked a name last is not necessarily who is holding
          it now, so the name has to be visible rather than buried in a menu. */}
      {currentUser && (
        <button
          type="button"
          onClick={startSwitch}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-full p-0.5 text-white hover:bg-white/10 sm:p-1 sm:pr-3"
          title={`Logged in as ${currentUser} — tap to change user`}
          aria-label={`Logged in as ${currentUser}. Change user.`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold">
            {initials(currentUser)}
          </span>
          <span className="hidden max-w-[9rem] text-left sm:block">
            <span className="block text-[10px] leading-tight text-white/60">Logged in as</span>
            <span className="block truncate text-xs font-semibold leading-tight">{currentUser}</span>
          </span>
        </button>
      )}
      {currentUser && (
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-white sm:w-9 hover:bg-white/10"
          aria-label="Goals"
          title="Goals"
        >
          <Target size={20} />
        </button>
      )}
      <button
        type="button"
        onClick={() => setScoreboardOpen(true)}
        className={`flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-white sm:w-9 hover:bg-white/10 ${currentUser ? '' : 'ml-auto'}`}
        aria-label="Scoreboard"
        title="Scoreboard"
      >
        <Trophy size={20} />
      </button>
      {/* Only shown once eBay is connected — a button that can only fail is worse than no
          button. Sales also refresh on their own; this is for wanting them now. */}
      {salesStatus?.ebayConfigured && (
        <button
          type="button"
          onClick={() => syncSales.mutate(undefined)}
          disabled={syncSales.isPending}
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-white sm:w-9 hover:bg-white/10 disabled:opacity-50"
          aria-label={syncSales.isPending ? 'Syncing with eBay' : 'Sync with eBay'}
          title={syncSales.isPending ? 'Syncing with eBay…' : 'Sync sales and listings from eBay'}
        >
          <RefreshCw size={20} className={syncSales.isPending ? 'animate-spin' : undefined} />
        </button>
      )}

      {/* A plain link, not a fetch: the endpoint sends Content-Disposition: attachment, so
          the browser saves it directly and never has to hold the whole file in memory. */}
      <a
        href="/api/export"
        className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-white sm:w-9 hover:bg-white/10"
        aria-label="Export all data to a spreadsheet"
        title="Export all data to a spreadsheet"
      >
        <Download size={20} />
      </a>
      <button
        type="button"
        onClick={() => setDark((d) => !d)}
        className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-white sm:w-9 hover:bg-white/10"
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full text-white sm:w-9 hover:bg-white/10"
        aria-label="Info"
      >
        <Info size={20} />
      </button>

      {scoreboardOpen && <Scoreboard onClose={() => setScoreboardOpen(false)} />}

      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-card bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-textPri">Reading the board</h2>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-primary text-primary hover:bg-surfaceMuted"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <Section title="Columns">
              <Row icon={<ClipboardList size={14} />} term="Not Started">
                Nothing done yet — no photos, no count, no condition.
              </Row>
              <Row icon={<Wrench size={14} />} term="Processing">
                Somebody has started: at least one step done, but it isn't on eBay yet.
              </Row>
              <Row icon={<Tag size={14} />} term="Listed / Sold">
                On eBay. Use the All / Listed / Sold buttons to see everything, only what is
                still for sale, or only what has sold.
              </Row>
            </Section>

            <Section title="On a card that is on eBay">
              <Row icon={<CalendarDays size={14} />} term="Days Listed">
                Shown as "5 days" — how long it has been on eBay.
              </Row>
              <Row icon={<Eye size={14} />} term="Views">Times the listing was opened, last 30 days.</Row>
              <Row icon={<Signal size={14} />} term="Impressions">
                Shown as "Impr" — times it appeared in search or the store, last 30 days.
              </Row>
              <Row icon={<Boxes size={14} />} term="Qty">Quantity still available on the listing.</Row>
              <Row icon={<span className="block h-2 w-2 rounded-full bg-primary" />} term="Active on eBay">
                Listed and unsold. Amber means part-sold, green means sold out. The price on
                the right is what eBay is asking; once sold it is what it fetched.
              </Row>
            </Section>

            <Section title="On every other card">
              <Row icon={<Wrench size={14} />} term="Manufacturer">Who made the part.</Row>
              <Row icon={<Factory size={14} />} term="Site">Inventory site it belongs to.</Row>
              <Row icon={<Layers size={14} />} term="# Locations">
                One SKU stocked in more than one bin. Quantities are added together.
              </Row>
              <Row icon={<MapPin size={14} />} term="Bin">Where it sits in the warehouse.</Row>
              <Row icon={<Package size={14} />} term="QOH">Quantity on hand, per the system.</Row>
              <Row icon={<ArrowRight size={14} />} term="Recovery bin">
                Shelf it was moved to at the Iron Barn.
              </Row>
            </Section>

            <Section title="Badges and flags">
              <Row icon={<AlertTriangle size={14} className="text-amber-600" />} term="High priority">
                Field review priority 1 or 2.
              </Row>
              <Row icon={<DollarSign size={14} className="text-primary" />} term="Positive margin">
                Expected to sell for more than it is carried at.
              </Row>
              <Row icon={<Flag size={14} className="text-purple-600" />} term="Needs review">
                Someone flagged it for a second look. Hover to read why.
              </Row>
              <Row icon={<ShoppingCart size={14} className="text-emerald-600" />} term="Sold out">
                Every unit accounted for.
              </Row>
              <Row icon={<AlertTriangle size={14} className="text-red-600" />} term="-2 / Not Found">
                Counted fewer than expected. Not Found means none were on the shelf at all.
              </Row>
            </Section>

            <Section title="Processing Status chips">
              <Row icon={<Camera size={14} />} term="Photographed">At least one photo saved.</Row>
              <Row icon={<Package size={14} />} term="Qty Confirmed">Somebody counted it.</Row>
              <Row icon={<ShieldCheck size={14} />} term="Condition">Box condition recorded.</Row>
              <Row icon={<Truck size={14} />} term="Transferred">Moved in Cetaris to market recovery.</Row>
              <Row icon={<Tag size={14} />} term="Listed">Live on eBay.</Row>
            </Section>
          </div>
        </div>
      )}
    </header>
  );
}
