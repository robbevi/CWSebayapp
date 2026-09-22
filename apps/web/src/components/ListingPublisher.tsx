import {
  agentPrompt,
  descriptionConditionWarning,
  draftReadiness,
  fillFromPart,
  formatDate,
  listingProblems,
  MAX_TITLE,
  parseAgentOutput,
  researchMismatch,
  SCHEDULE_MAX_DAYS,
  SCHEDULE_MIN_MINUTES,
  scheduleProblem,
  tradingCondition,
  type AgentListing,
  type CategorySuggestion,
  type ItemSpecific,
  type ListingCheck,
  type PartGroup,
  type PolicyChoice,
  type SellerPolicy,
} from '@warehouse/shared';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCopy,
  Eye,
  Info,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useCategorySuggestions,
  useCheckListing,
  usePublishListing,
  useRequestResearch,
  useResearch,
  useSellerSetup,
} from '../hooks/useEbayListing';
import { useSalesStatus } from '../hooks/useSales';
import { ListingRequestError } from '../lib/api';
import { useUserStore } from '../state/useUserStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { SelectDropdown } from './ui/SelectDropdown';
import { Textarea } from './ui/Textarea';

/**
 * Turns the Copilot agent's research into a live eBay listing.
 *
 * Copy a prompt carrying the part's confirmed facts, paste the agent's answer back, check
 * the result with eBay, publish. SPARE contributes the photographs, the counted quantity
 * and the inspected condition; everything the agent estimated stays editable, and nothing
 * can be published until eBay has accepted exactly what is on screen.
 */

interface Draft {
  text: string;
  listing: AgentListing | null;
  notes: string[];
}

const draftKey = (sku: string) => `spare.listing.${sku}`;
const POLICY_KEY = 'spare.listing.policies';

// Browser storage can be missing or refuse writes; a draft that doesn't persist is fine.
function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function store(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not persisted */
  }
}

const NEEDS: Record<string, string> = {
  'no photographs': 'photographs',
  'quantity not confirmed': 'a counted quantity',
  'no item condition': 'an item condition',
  'nothing to build a title from': 'a description',
};

const numText = (v: number | null) => (v == null ? '' : String(v));
const toNum = (t: string) => (t.trim() === '' || !Number.isFinite(Number(t)) ? null : Number(t));

function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold text-textMuted">{children}</label>;
}

function PolicySelect({
  label,
  list,
  value,
  onChange,
}: {
  label: string;
  list: SellerPolicy[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <SelectDropdown
        options={list.map((p) => p.name)}
        value={list.find((p) => p.id === value)?.name ?? ''}
        placeholder="Choose a policy"
        onChange={(name) => onChange(list.find((p) => p.name === name)?.id ?? '')}
      />
    </div>
  );
}

function Messages({ check }: { check: ListingCheck }) {
  const lines: { tone: 'error' | 'warning' | 'info'; text: string }[] = [
    ...check.problems.map((text) => ({ tone: 'error' as const, text })),
    ...check.missingSpecifics.map((name) => ({
      tone: 'error' as const,
      text: `This category requires the item specific "${name}".`,
    })),
    ...check.messages.map((m) => ({ tone: m.severity, text: m.message })),
  ];
  if (!lines.length) return null;
  const tone = {
    error: 'text-red-600',
    warning: 'text-amber-600',
    info: 'text-textMuted',
  };
  const icon = {
    error: <X size={12} className="mt-0.5 shrink-0" />,
    warning: <AlertTriangle size={12} className="mt-0.5 shrink-0" />,
    info: <Info size={12} className="mt-0.5 shrink-0" />,
  };
  return (
    <ul className="mt-2 space-y-1">
      {lines.map((l, i) => (
        <li key={i} className={`flex gap-1.5 ${tone[l.tone]}`}>
          {icon[l.tone]}
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

const chip = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
    active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-textMuted hover:bg-surfaceMuted'
  }`;

/**
 * The agent recommends a category by path; eBay needs its number. Shows eBay's own
 * suggestions ranked against that path, and picks the top one only when it is a clear
 * match. The agent's paths can be slightly off, so the choice stays in view.
 */
function CategoryPicker({
  listing,
  checkedName,
  onPick,
  onTypeId,
}: {
  listing: AgentListing;
  checkedName?: string;
  onPick: (s: CategorySuggestion) => void;
  onTypeId: (id: string) => void;
}) {
  const [browsing, setBrowsing] = useState(!listing.categoryId);
  const suggestions = useCategorySuggestions(listing.titleOptions[0] ?? listing.title, listing.categoryPath ?? '', browsing);

  useEffect(() => {
    const [top, next] = suggestions.data ?? [];
    if (!listing.categoryId && top?.leafMatch && (next?.score ?? -1) < top.score) onPick(top);
    // Only when new suggestions arrive; picking again on every edit would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.data]);

  return (
    <div>
      <Label>eBay category</Label>
      {listing.categoryPath && (
        <p className="mb-1.5 text-[11px] text-textMuted">Agent recommended: {listing.categoryPath}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="w-28 shrink-0">
          <Input
            inputMode="numeric"
            aria-label="Category ID"
            placeholder="ID"
            value={listing.categoryId}
            onChange={(e) => onTypeId(e.target.value.trim())}
          />
        </div>
        <span className="min-w-0 flex-1 text-xs text-textPri">
          {checkedName ?? listing.categoryName ?? (listing.categoryId ? 'Named after the eBay check' : 'Choose one below')}
        </span>
        <button type="button" onClick={() => setBrowsing((v) => !v)} className="shrink-0 text-[11px] font-semibold text-primary">
          {browsing ? 'Hide matches' : 'Change'}
        </button>
      </div>
      {browsing && (
        <div className="mt-1.5 space-y-1">
          {suggestions.isLoading && <p className="text-[11px] text-textMuted">Finding eBay categories…</p>}
          {suggestions.error && <p className="text-[11px] text-red-600">{suggestions.error.message}</p>}
          {suggestions.data?.length === 0 && (
            <p className="text-[11px] text-textMuted">eBay suggested nothing. Enter the category ID.</p>
          )}
          {suggestions.data?.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className={`block w-full rounded-btn border px-2 py-1.5 text-left text-[11px] ${
                s.id === listing.categoryId ? 'border-primary bg-primary/10' : 'border-border hover:bg-surfaceMuted'
              }`}
            >
              <span className="font-semibold text-textPri">{s.name}</span>
              <span className="text-textMuted"> · {s.id}</span>
              <span className="block text-textMuted">{s.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A datetime-local value in the browser's own timezone, which is how the input reads it. */
function inputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Tomorrow morning: far enough off to be reviewed, close enough to not be forgotten. */
function defaultScheduleAt(): string {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(9, 0, 0, 0);
  return inputValue(at);
}

export function ListingPublisher({ group, onPublished }: { group: PartGroup; onPublished: (itemId: string) => void }) {
  const saved = useMemo(() => load<Draft>(draftKey(group.sku)), [group.sku]);
  const [open, setOpen] = useState(!!saved?.listing);
  const [text, setText] = useState(saved?.text ?? '');
  const [listing, setListing] = useState<AgentListing | null>(
    // Drafts saved before these lists existed come back without them.
    saved?.listing
      ? { ...saved.listing, titleOptions: saved.listing.titleOptions ?? [], priceOptions: saved.listing.priceOptions ?? [] }
      : null
  );
  const [notes, setNotes] = useState<string[]>(saved?.notes ?? []);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Empty means list now. A scheduled listing waits under Scheduled in Seller Hub, where it
  // can be read over once more before it goes live.
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<PolicyChoice | null>(() => load<PolicyChoice>(POLICY_KEY));
  const [check, setCheck] = useState<{ key: string; result: ListingCheck } | null>(null);
  const currentUser = useUserStore((s) => s.currentUser);
  const isAdmin = useUserStore((s) => !!s.session?.admin);
  const { data: status } = useSalesStatus();

  const setup = useSellerSetup(open);

  // Copilot research: a request goes to the Copilot Studio workflow, and its reply turns up
  // minutes later as a file SPARE reads. The pending request survives closing the panel.
  const researchKey = `spare.research.${group.sku}`;
  const researchEnabled = !!status?.research;
  const [requestedAt, setRequestedAt] = useState<string | null>(() => load<string>(researchKey));
  const research = useResearch(group.primary.id, open && researchEnabled && !listing, !!requestedAt);
  const requestResearch = useRequestResearch();

  // A reply newer than the request fills the form in by itself. Drive's clock and the
  // server's can disagree slightly, hence the minute's allowance.
  useEffect(() => {
    const r = research.data;
    if (!requestedAt || !r?.found || !r.createdAt) return;
    if (Date.parse(r.createdAt) < Date.parse(requestedAt) - 60_000) return;
    setRequestedAt(null);
    store(researchKey, null);
    if (r.listing) {
      setListing(fillFromPart(r.listing, group));
      setNotes(r.notes ?? []);
      setCheck(null);
      setParseError(null);
    } else {
      setParseError(r.error ?? "Couldn't read Copilot's research.");
    }
  }, [research.data, requestedAt, researchKey, group]);
  const checkListing = useCheckListing();
  const publish = usePublishListing();

  // Last-used policies win, as long as they still exist; otherwise the ones on the team's
  // current listings.
  useEffect(() => {
    const s = setup.data;
    if (!s) return;
    setPolicies((prev) => {
      const pickId = (list: SellerPolicy[], mine?: string, theirs?: string) =>
        [mine, theirs, list[0]?.id].find((id) => id && list.some((p) => p.id === id)) ?? '';
      return {
        shipping: pickId(s.shipping, prev?.shipping, s.defaults.shipping),
        returns: pickId(s.returns, prev?.returns, s.defaults.returns),
        payment: pickId(s.payment, prev?.payment, s.defaults.payment),
      };
    });
  }, [setup.data]);

  useEffect(() => {
    store(draftKey(group.sku), text || listing ? { text, listing, notes } : null);
  }, [group.sku, text, listing, notes]);

  useEffect(() => {
    if (policies) store(POLICY_KEY, policies);
  }, [policies]);

  const readiness = draftReadiness(group);
  if (!status?.ebayPublishing) return null;
  if (readiness.blockers.includes('already listed on eBay')) return null;

  if (readiness.blockers.length) {
    return (
      <div className="rounded-card border border-border bg-surfaceMuted p-3 text-[11px] text-textMuted">
        <span className="font-semibold text-textPri">eBay listing</span> — available once the part has{' '}
        {readiness.blockers.map((b) => NEEDS[b] ?? b).join(', ')}.
      </div>
    );
  }

  const key = JSON.stringify({ listing, policies });
  const checked = check && check.key === key ? check.result : null;
  const condition = tradingCondition(group.itemCondition);
  const quantity = group.confirmedQoh ?? group.stockQty;
  const localProblems = listing ? listingProblems(listing) : [];
  const mismatch = listing ? researchMismatch(listing, group.sku) : null;
  const conditionWarning = listing ? descriptionConditionWarning(listing, group.itemCondition) : null;
  const busy = checkListing.isPending || publish.isPending;

  const update = (patch: Partial<AgentListing>) => setListing((l) => (l ? { ...l, ...patch } : l));
  const updateSpecific = (i: number, patch: Partial<ItemSpecific>) =>
    update({ specifics: listing!.specifics.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const copyPrompt = () => {
    void navigator.clipboard.writeText(agentPrompt(group)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const readAnswer = () => {
    const result = parseAgentOutput(text);
    if (!result.listing) {
      setParseError(result.error ?? "Couldn't read the agent's answer.");
      return;
    }
    setParseError(null);
    setListing(fillFromPart(result.listing, group));
    setNotes(result.notes);
    setCheck(null);
  };

  const startResearch = () =>
    requestResearch.mutate(group.primary.id, {
      onSuccess: (r) => {
        setRequestedAt(r.requestedAt);
        store(researchKey, r.requestedAt);
      },
    });

  const applyResearch = () => {
    const r = research.data;
    if (!r?.listing) {
      setParseError(r?.error ?? "Couldn't read Copilot's research.");
      return;
    }
    setParseError(null);
    setListing(fillFromPart(r.listing, group));
    setNotes(r.notes ?? []);
    setCheck(null);
  };

  const startOver = () => {
    setText('');
    setListing(null);
    setNotes([]);
    setCheck(null);
    setParseError(null);
    checkListing.reset();
    publish.reset();
  };

  const runCheck = () => {
    if (!listing || !policies) return;
    const checkedKey = key;
    checkListing.mutate(
      { partId: group.primary.id, listing, policies },
      { onSuccess: (result) => setCheck({ key: checkedKey, result }) }
    );
  };

  const runPublish = () => {
    if (!listing || !policies || !checked?.ok) return;
    const startsAt = scheduleAt ? new Date(scheduleAt) : null;
    if (startsAt) {
      const problem = scheduleProblem(startsAt.toISOString());
      if (problem) {
        setScheduleError(problem);
        return;
      }
    }
    const confirmed = window.confirm(
      `Publish "${listing.title}" to eBay at $${listing.price?.toFixed(2)} (qty ${quantity})?\n\n${
        startsAt
          ? `It waits under Scheduled in Seller Hub until ${startsAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`
          : 'It goes live immediately.'
      }`
    );
    if (!confirmed) return;
    publish.mutate(
      {
        partId: group.primary.id,
        listing,
        policies,
        submittedBy: currentUser ?? undefined,
        scheduleTime: startsAt ? startsAt.toISOString() : undefined,
      },
      {
        onSuccess: (result) => {
          store(draftKey(group.sku), null);
          onPublished(result.itemId);
        },
      }
    );
  };

  const requestError = checkListing.error ?? publish.error;
  const rejectedBy = requestError instanceof ListingRequestError ? requestError.messages : [];

  return (
    <div className="rounded-card border border-primary/30 bg-primary/5 p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-textPri">
            <Tag size={13} />
            {listing ? 'eBay listing in progress' : 'List on eBay'}
          </span>
          <span className="mt-0.5 block text-[11px] text-textMuted">
            {listing
              ? checked?.ok
                ? 'Checked with eBay — ready to publish'
                : 'Review the details, check with eBay, then publish'
              : `${researchEnabled ? 'Research with Copilot' : 'Research with your agent, paste the answer'}, publish with ${group.photos.length} SPARE ${group.photos.length === 1 ? 'photo' : 'photos'}`}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-textMuted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !listing && (
        <div className="mt-3 space-y-3 border-t border-primary/20 pt-3">
          {researchEnabled && (
            <div className="rounded-btn border border-border bg-surface p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-textPri">
                <Sparkles size={13} />
                Copilot research
              </div>
              <p className="text-[11px] text-textMuted">
                {requestedAt
                  ? `Researching since ${new Date(requestedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, usually 2–4 minutes. The listing fills in by itself when it's done.`
                  : research.data?.found
                    ? `Research from ${formatDate(research.data.createdAt)} is ready${research.data.error ? `, but ${research.data.error}` : '.'}`
                    : 'Copilot researches the part — title, category, price, description, specifics — and fills in the listing. Takes a few minutes.'}
              </p>
              <div className="mt-2 flex gap-2">
                {research.data?.found && research.data.listing && !requestedAt && (
                  <Button type="button" onClick={applyResearch} className="flex-1">
                    Use this research
                  </Button>
                )}
                <Button
                  type="button"
                  variant={research.data?.found ? 'outline' : 'primary'}
                  onClick={startResearch}
                  disabled={requestResearch.isPending || !!requestedAt}
                  className="flex-1"
                >
                  <Sparkles size={14} />
                  {requestedAt ? 'Researching…' : research.data?.found ? 'Research again' : 'Research with Copilot'}
                </Button>
              </div>
            </div>
          )}
          {researchEnabled && parseError && <p className="text-[11px] text-red-600">{parseError}</p>}
          {/* By hand in Copilot chat: only while the research workflow isn't set up, so there
              is always some way to list. */}
          {!researchEnabled && (
            <>
              <div>
                <Label>1. Give your agent this part</Label>
                <Button type="button" variant="outline" onClick={copyPrompt} className="w-full">
                  {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                  {copied ? 'Copied — paste it into Copilot' : 'Copy prompt for the agent'}
                </Button>
              </div>
              <div>
                <Label>2. Paste the agent&apos;s answer</Label>
                <Textarea
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder='{ "title": "…", "categoryId": "…", "price": … }'
                  className="font-mono text-[11px]"
                />
                {parseError && <p className="mt-1 text-[11px] text-red-600">{parseError}</p>}
              </div>
              <Button type="button" onClick={readAnswer} disabled={!text.trim()} className="w-full">
                Read answer
              </Button>
            </>
          )}
        </div>
      )}

      {open && listing && (
        <div className="mt-3 space-y-3 border-t border-primary/20 pt-3">
          {notes.map((n) => (
            <p key={n} className="flex gap-1.5 text-[11px] text-textMuted">
              <Info size={12} className="mt-0.5 shrink-0" />
              {n}
            </p>
          ))}

          {mismatch && (
            <div className="flex gap-1.5 rounded-btn border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] font-semibold text-red-600">
              <X size={12} className="mt-0.5 shrink-0" />
              {mismatch} Start over and {researchEnabled ? 'research this part again' : 'paste the research for this part'}.
            </div>
          )}
          {conditionWarning && (
            <p className="flex gap-1.5 text-[11px] text-amber-600">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {conditionWarning}
            </p>
          )}

          <div>
            <Label>
              Title{' '}
              <span className={listing.title.length > MAX_TITLE ? 'text-red-600' : ''}>
                ({listing.title.length}/{MAX_TITLE})
              </span>
            </Label>
            <Input value={listing.title} onChange={(e) => update({ title: e.target.value })} />
            {listing.titleOptions.some((t) => t !== listing.title) && (
              <div className="mt-1.5 space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-textMuted">Agent&apos;s titles</span>
                {listing.titleOptions
                  .filter((t) => t !== listing.title)
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => update({ title: t })}
                      className="block w-full rounded-btn border border-border px-2 py-1 text-left text-[11px] text-textPri hover:bg-surfaceMuted"
                    >
                      {t} <span className={t.length > MAX_TITLE ? 'text-red-600' : 'text-textMuted'}>({t.length})</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <CategoryPicker
            listing={listing}
            checkedName={checked?.category?.id === listing.categoryId ? checked.category.name : undefined}
            onPick={(c) => update({ categoryId: c.id, categoryName: c.name })}
            onTypeId={(id) => update({ categoryId: id, categoryName: undefined })}
          />

          <div>
            <Label>
              Price (USD){listing.priceConfidence ? ` (agent confidence: ${listing.priceConfidence})` : ''}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-28 shrink-0">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Price"
                  value={numText(listing.price)}
                  onChange={(e) => update({ price: toNum(e.target.value) })}
                />
              </div>
              {listing.priceOptions.map((o) => (
                <button key={o.label} type="button" onClick={() => update({ price: o.amount })} className={chip(listing.price === o.amount)}>
                  {o.label} ${o.amount.toFixed(2)}
                </button>
              ))}
            </div>
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-textMuted">
              <input type="checkbox" checked={listing.bestOffer} onChange={(e) => update({ bestOffer: e.target.checked })} />
              Accept Best Offers
            </label>
          </div>

          <div>
            <Label>Package (estimated by the agent — check it)</Label>
            <div className="grid grid-cols-5 gap-2">
              {(
                [
                  ['weightLb', 'lb'],
                  ['weightOz', 'oz'],
                  ['lengthIn', 'L in'],
                  ['widthIn', 'W in'],
                  ['heightIn', 'H in'],
                ] as const
              ).map(([field, unit]) => (
                <div key={field}>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    aria-label={unit}
                    value={numText(listing[field])}
                    onChange={(e) => update({ [field]: toNum(e.target.value) })}
                  />
                  <span className="mt-0.5 block text-center text-[10px] text-textMuted">{unit}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Item specifics</Label>
            <div className="space-y-1.5">
              {listing.specifics.map((s, i) => (
                // Widths sit on wrappers: Input carries its own w-full, and cn() doesn't
                // resolve conflicting classes, so a width passed to it may not win.
                <div key={i} className="flex gap-1.5">
                  <div className="w-2/5 shrink-0">
                    <Input value={s.name} aria-label="Specific" onChange={(e) => updateSpecific(i, { name: e.target.value })} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Input
                      value={s.values.join(' | ')}
                      aria-label={`${s.name} value`}
                      onChange={(e) => updateSpecific(i, { values: e.target.value.split('|').map((v) => v.trim()) })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => update({ specifics: listing.specifics.filter((_, j) => j !== i) })}
                    className="shrink-0 rounded-btn px-2 text-textMuted hover:bg-surfaceMuted"
                    aria-label={`Remove ${s.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => update({ specifics: [...listing.specifics, { name: '', values: [''] }] })}
              className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-primary"
            >
              <Plus size={12} /> Add specific
            </button>
            {checked?.category && checked.category.recommended.length > 0 && (
              <p className="mt-1 text-[11px] text-textMuted">
                eBay recommends for this category: {checked.category.recommended.slice(0, 8).join(', ')}
              </p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-textMuted">Description (HTML)</span>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary"
              >
                <Eye size={12} /> {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {showPreview ? (
              // Sandboxed: the HTML came from outside SPARE, so it gets no scripts and no
              // access to the page.
              <iframe
                sandbox=""
                srcDoc={listing.descriptionHtml}
                title="Description preview"
                className="h-64 w-full rounded-btn border border-border bg-white"
              />
            ) : (
              <Textarea
                rows={6}
                value={listing.descriptionHtml}
                onChange={(e) => update({ descriptionHtml: e.target.value })}
                className="font-mono text-[11px]"
              />
            )}
          </div>

          <div className="rounded-btn border border-border bg-surface p-2.5 text-[11px] text-textMuted">
            <div className="mb-1.5 font-semibold text-textPri">From SPARE</div>
            <div>
              Condition: {condition?.label ?? group.itemCondition} · Quantity: {quantity} · SKU: {group.sku}
            </div>
            <div className="mt-1.5 flex gap-1 overflow-x-auto">
              {group.photos.slice(0, 24).map((p) => (
                <img key={p.fileId} src={p.url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded object-cover" />
              ))}
            </div>
            {setup.data?.shipFrom && (
              <div className="mt-1.5">
                Ships from {setup.data.shipFrom.location} {setup.data.shipFrom.postalCode}
              </div>
            )}
          </div>

          {setup.isLoading && <p className="text-[11px] text-textMuted">Loading your eBay policies…</p>}
          {setup.error && <p className="text-[11px] text-red-600">{setup.error.message}</p>}
          {setup.data && policies && (
            <div className="grid gap-3 sm:grid-cols-3">
              <PolicySelect
                label="Shipping"
                list={setup.data.shipping}
                value={policies.shipping}
                onChange={(id) => setPolicies({ ...policies, shipping: id })}
              />
              <PolicySelect
                label="Returns"
                list={setup.data.returns}
                value={policies.returns}
                onChange={(id) => setPolicies({ ...policies, returns: id })}
              />
              <PolicySelect
                label="Payment"
                list={setup.data.payment}
                value={policies.payment}
                onChange={(id) => setPolicies({ ...policies, payment: id })}
              />
            </div>
          )}

          {localProblems.length > 0 && (
            <ul className="space-y-1 text-[11px] text-amber-600">
              {localProblems.map((p) => (
                <li key={p} className="flex gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          )}

          {checked && (
            <div
              className={`rounded-btn border p-2.5 text-[11px] ${
                checked.ok ? 'border-primary/40 bg-primary/10' : 'border-red-500/40 bg-red-500/10'
              }`}
            >
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${checked.ok ? 'text-primary' : 'text-red-600'}`}>
                {checked.ok ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                {checked.ok ? 'eBay accepts this listing' : 'eBay would not accept this yet'}
              </div>
              <p className="mt-1 text-textMuted">
                {checked.fees.length
                  ? `Upfront fees: ${checked.fees.map((f) => `${f.name} $${f.amount.toFixed(2)}`).join(', ')}.`
                  : 'No upfront fees.'}{' '}
                Final value fees apply when it sells.
              </p>
              <Messages check={checked} />
            </div>
          )}
          {check && !checked && (
            <p className="text-[11px] text-textMuted">Changed since the last check — check again before publishing.</p>
          )}

          {requestError && (
            <div className="rounded-btn border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] text-red-600">
              <div className="font-semibold">{requestError.message}</div>
              {rejectedBy.map((m, i) => (
                <div key={i} className="mt-1">
                  {m.message}
                </div>
              ))}
            </div>
          )}

          {!isAdmin && checked?.ok && (
            <p className="text-[11px] text-textMuted">eBay accepts this listing. Only an admin can publish it.</p>
          )}
          {/* Scheduling is eBay's own: the listing is created now and held until the time
              given, so nothing has to keep running here for it to go live. */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-textMuted">
            <span className="flex items-center gap-1.5 font-semibold text-textPri">
              <CalendarClock size={13} /> Start
            </span>
            <select
              aria-label="When the listing should start"
              value={scheduleAt ? 'later' : 'now'}
              onChange={(e) => {
                setScheduleError(null);
                setScheduleAt(e.target.value === 'now' ? '' : defaultScheduleAt());
              }}
              className="rounded-btn border border-border bg-surface px-2 py-1 text-xs text-textPri"
            >
              <option value="now">Immediately</option>
              <option value="later">At a set time</option>
            </select>
            {scheduleAt && (
              <input
                type="datetime-local"
                aria-label="Listing start time"
                value={scheduleAt}
                min={inputValue(new Date(Date.now() + SCHEDULE_MIN_MINUTES * 60_000))}
                max={inputValue(new Date(Date.now() + SCHEDULE_MAX_DAYS * 24 * 60 * 60_000))}
                onChange={(e) => {
                  setScheduleError(null);
                  setScheduleAt(e.target.value);
                }}
                className="rounded-btn border border-border bg-surface px-2 py-1 text-xs text-textPri"
              />
            )}
            {scheduleAt && !scheduleError && <span>Waits under Scheduled in Seller Hub until then.</span>}
            {scheduleError && <span className="font-semibold text-red-600">{scheduleError}</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={startOver} disabled={busy}>
              <RotateCcw size={14} /> Start over
            </Button>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant={checked?.ok ? 'outline' : 'primary'}
                onClick={runCheck}
                disabled={busy || !policies || localProblems.length > 0 || !!mismatch}
              >
                <ShieldCheck size={14} />
                {checkListing.isPending ? 'Checking…' : 'Check with eBay'}
              </Button>
              <Button
                type="button"
                onClick={runPublish}
                disabled={busy || !checked?.ok || !isAdmin}
                title={isAdmin ? undefined : 'Only an admin can publish to eBay'}
              >
                <Tag size={14} />
                {publish.isPending
                  ? scheduleAt
                    ? 'Scheduling…'
                    : 'Publishing…'
                  : scheduleAt
                    ? 'Schedule on eBay'
                    : 'Publish to eBay'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
