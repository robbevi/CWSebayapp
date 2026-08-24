import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Check, Flag, Pencil, ShoppingCart, Tag, Trash2, X } from 'lucide-react';
import {
  daysListed,
  formatVariance,
  getDiscrepancy,
  groupPartsBySku,
  indexSales,
  IRON_BARN_BINS,
  salesForGroup,
  soldPosition,
  type InventoryPartPatch,
} from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDeletePart } from '../hooks/useDeletePart';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useSales } from '../hooks/useSales';
import { useSavePart } from '../hooks/useSavePart';
import { useUIStore } from '../state/useUIStore';
import { useUserStore } from '../state/useUserStore';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';
import { ComboBox } from './ui/ComboBox';
import { SelectDropdown } from './ui/SelectDropdown';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { PhotoUploader } from './PhotoUploader';
import { QtyStepper } from './QtyStepper';

const ITEM_CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor', 'For Parts'];
const BOX_CONDITIONS = ['Excellent', 'Very Good', 'Good', 'Poor', 'No Box', 'Part in Bag'];
const CONDITION_PLACEHOLDER = 'Select Condition';

const EXCEPTION_GROUPS = [
  { label: 'Not Found', options: ['Unable to Locate', 'Location Discrepancy'] },
  { label: 'Operational Use', options: ['Currently Active Unit', 'Reserved for Operations', 'Committed to Work Order'] },
  { label: 'Condition Issues', options: ['Damaged', 'Excessive Wear', 'Non-Functional', 'Missing Components'] },
  { label: 'Business Decision', options: ['Low Resale Value', 'No Market Demand', 'Scrap', 'Recycle'] },
  { label: 'Other', options: ['Other'] },
];
const EXCEPTION_PLACEHOLDER = 'No Exception';
const YES_NO = ['No', 'Yes'];

const schema = z.object({
  // Identity fields shared by every row of this SKU.
  description: z.string().optional(),
  manufacturer: z.string().optional(),
  // One entry per underlying row, so a SKU stocked in several bins can have each of them
  // corrected without merging the rows together.
  locations: z.array(
    z.object({
      id: z.string(),
      inventorySite: z.string().optional(),
      binLocation: z.string().optional(),
      qoh: z.number().min(0),
    })
  ),
  needsReview: z.boolean(),
  needsReviewNote: z.string().optional(),
  confirmedQoh: z.number().min(0),
  // Tracked separately from the number itself: the stepper is pre-filled with the system
  // quantity, so without an explicit confirm the "Qty Confirmed" checkpoint would be
  // satisfied by simply opening and saving a part nobody actually counted.
  qohConfirmed: z.boolean(),
  notes: z.string().optional(),
  itemCondition: z.string().optional(),
  boxCondition: z.string().optional(),
  disposition: z.string().optional(),
  dispositionNote: z.string().optional(),
  transferredToMarketRecovery: z.boolean(),
  transferId: z.string().optional(),
  newBinLocation: z.string().optional(),
  itemListed: z.boolean(),
  itemListedDate: z.string().optional(),
  ebayListingId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function PartDetailModal() {
  const { selectedId, modalOpen, set } = useUIStore();
  const { data: parts } = useInventoryParts();
  const { data: sales } = useSales();
  const savePart = useSavePart();
  const deletePart = useDeletePart();
  const currentUser = useUserStore((s) => s.currentUser);

  // The board shows one card per SKU, so the modal resolves the same way: find the group
  // whose primary record was selected, then work against that group.
  const groups = useMemo(() => groupPartsBySku(parts ?? []), [parts]);
  const group = groups.find((g) => g.id === selectedId) ?? groups.find((g) => g.records.some((r) => r.id === selectedId));
  const part = group?.primary;
  const [editingHeader, setEditingHeader] = useState(false);
  useBodyScrollLock(modalOpen && !!part);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

  // Separate collapse/expand thresholds: with a single cut-off, scrolling that hovers right
  // on the line makes the panel flap open and shut on every jitter of the finger.
  const handleFormScroll = (e: React.UIEvent<HTMLFormElement>) => {
    const y = e.currentTarget.scrollTop;
    setSummaryCollapsed((collapsed) => (collapsed ? y > 8 : y > 48));
  };

  const { register, control, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: '',
      manufacturer: '',
      locations: [],
      needsReview: false,
      needsReviewNote: '',
      confirmedQoh: 0,
      qohConfirmed: false,
      notes: '',
      itemCondition: '',
      boxCondition: '',
      disposition: '',
      dispositionNote: '',
      transferredToMarketRecovery: false,
      transferId: '',
      newBinLocation: '',
      itemListed: false,
      itemListedDate: '',
      ebayListingId: '',
    },
  });

  useEffect(() => {
    if (part && group) {
      reset({
        description: group.description,
        manufacturer: group.manufacturer,
        locations: group.locations.map((l) => ({
          id: l.id,
          inventorySite: l.inventorySite ?? '',
          binLocation: l.binLocation ?? '',
          qoh: l.qoh,
        })),
        needsReview: group.needsReview,
        needsReviewNote: group.needsReviewNote ?? '',
        confirmedQoh: part.confirmedQoh ?? part.qoh,
        qohConfirmed: part.confirmedQoh !== null && part.confirmedQoh !== undefined,
        notes: part.notes ?? '',
        itemCondition: part.itemCondition ?? '',
        boxCondition: part.boxCondition ?? '',
        disposition: part.disposition ?? '',
        dispositionNote: part.dispositionNote ?? '',
        transferredToMarketRecovery: part.transferredToMarketRecovery,
        transferId: part.transferId ?? '',
        newBinLocation: part.newBinLocation ?? '',
        itemListed: part.itemListed,
        // itemListedDate is stored as a full ISO datetime ("2026-07-16T00:00:00.000Z"),
        // but a native <input type="date"> only accepts exactly "YYYY-MM-DD" as its
        // value — anything else is silently treated as invalid and rendered blank, even
        // though the data was saved correctly. Slicing to the date portion fixes display.
        itemListedDate: part.itemListedDate ? part.itemListedDate.slice(0, 10) : '',
        ebayListingId: part.ebayListingId ?? '',
      });
      setEditingHeader(false);
    }
  }, [part, group, reset]);

  if (!modalOpen || !part || !group) return null;

  const multiLocation = group.locations.length > 1;
  const partSales = salesForGroup(group, indexSales(sales ?? []));
  const sold = soldPosition(group, partSales);
  const itemListed = watch('itemListed');
  const needsReview = watch('needsReview');
  const transferred = watch('transferredToMarketRecovery');
  const disposition = watch('disposition');

  // Only meaningful once they've confirmed — before that the stepper still holds the
  // pre-filled system quantity, and flagging "0 vs 5" while they're mid-count is noise.
  const qohConfirmed = watch('qohConfirmed');
  const liveDiscrepancy = qohConfirmed ? getDiscrepancy({ qoh: part.qoh, confirmedQoh: watch('confirmedQoh') }) : null;

  // Parts loaded before the recovery columns existed have none of these — hide the whole
  // row rather than show four em-dashes.
  const hasRecoveryData =
    group.revenuePriorityRank != null ||
    !!group.fieldReviewPriority ||
    group.activeRecoveryPriceBasis != null ||
    group.expectedGrossRecoveryMargin != null;

  const close = () => {
    if (formState.isDirty && !window.confirm('Discard unsaved changes?')) return;
    set({ modalOpen: false, selectedId: null });
  };

  const onSubmit = handleSubmit(async (values) => {
    // Identity edits can touch any row of the SKU, so patches are collected per record and
    // only sent where something actually changed — a save shouldn't rewrite untouched rows.
    const patches = new Map<string, InventoryPartPatch>();
    const addPatch = (id: string, patch: InventoryPartPatch) => {
      patches.set(id, { ...(patches.get(id) ?? {}), ...patch });
    };

    // Keyed off what was actually typed in, not off what merely differs. The rows of a SKU
    // often disagree about manufacturer or description already, and a plain Save must not
    // quietly rewrite rows the user never opened the editor on.
    const dirty = formState.dirtyFields;
    if (dirty.manufacturer || dirty.description) {
      for (const record of group.records) {
        if (dirty.manufacturer) addPatch(record.id, { manufacturer: values.manufacturer ?? '' });
        if (dirty.description) addPatch(record.id, { description: values.description ?? '' });
      }
    }

    values.locations.forEach((loc, i) => {
      const dirtyLoc = dirty.locations?.[i];
      if (!dirtyLoc) return;
      if (dirtyLoc.inventorySite) addPatch(loc.id, { inventorySite: loc.inventorySite ?? '' });
      if (dirtyLoc.binLocation) addPatch(loc.id, { binLocation: loc.binLocation ?? '' });
      if (dirtyLoc.qoh) addPatch(loc.id, { qoh: Number(loc.qoh) });
    });

    if (dirty.needsReview || dirty.needsReviewNote) {
      addPatch(part.id, {
        needsReview: values.needsReview,
        needsReviewNote: values.needsReview ? values.needsReviewNote || undefined : undefined,
      });
    }

    addPatch(part.id, {
      confirmedQoh: values.qohConfirmed ? values.confirmedQoh : null,
      notes: values.notes,
      itemCondition: values.itemCondition || undefined,
      boxCondition: values.boxCondition || undefined,
      disposition: values.disposition || undefined,
      dispositionNote: values.disposition === 'Other' ? values.dispositionNote || undefined : undefined,
      transferredToMarketRecovery: values.transferredToMarketRecovery,
      transferId: values.transferredToMarketRecovery ? values.transferId || undefined : null,
      newBinLocation: values.newBinLocation?.trim() || undefined,
      itemListed: values.itemListed,
      itemListedDate: values.itemListed ? values.itemListedDate || new Date().toISOString() : null,
      ebayListingId: values.itemListed ? values.ebayListingId || undefined : null,
    });

    // Sequential rather than parallel: each write is a read-modify-write of the same sheet,
    // so overlapping calls can round-trip a stale copy of a neighbouring row.
    for (const [id, patch] of patches) {
      await savePart.mutateAsync({ id, patch, submittedBy: currentUser ?? undefined });
    }
    set({ modalOpen: false, selectedId: null });
  });

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${part.sku}? This cannot be undone.`)) return;
    await deletePart.mutateAsync({ id: part.id, sku: part.sku });
    set({ modalOpen: false, selectedId: null });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="flex max-h-[85vh] w-full flex-col rounded-card bg-surface sm:w-[720px]">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <div>
            <div className="text-base font-semibold text-textPri">{part.sku}</div>
            <div className="text-xs text-textMuted">
              {multiLocation
                ? `${group.locations.length} locations · ${group.qoh} total`
                : `Bin ${part.binLocation || '—'}`}
              {group.newBinLocation && <span className="text-primary"> → {group.newBinLocation}</span>} ·{' '}
              {group.description}
            </div>
          </div>
          <button onClick={close} className="rounded-btn p-2 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <div
          className={cn(
            'shrink-0 border-b border-border p-4',
            // Editing a SKU with several locations makes this block taller than a phone
            // screen; capping and scrolling it keeps the form and Save reachable.
            editingHeader && 'max-h-[45vh] overflow-y-auto overscroll-contain'
          )}
        >
          <div className="rounded-card bg-surfaceMuted p-3 text-xs">
            {/* Identity and location stay put — this is what you check while working. */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-textMuted">
                {multiLocation ? `${group.locations.length} locations` : 'Details'}
              </span>
              <button
                type="button"
                onClick={() => setEditingHeader((e) => !e)}
                aria-pressed={editingHeader}
                className={cn(
                  'flex min-h-0 items-center gap-1 rounded-pill px-2 py-1 text-[11px] font-semibold',
                  editingHeader ? 'bg-primary text-white' : 'text-primary hover:bg-surface'
                )}
              >
                <Pencil size={11} />
                {editingHeader ? 'Done editing' : 'Edit'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              {/* SKU is fixed: photos are found in Drive by this value, so renaming it here
                  would leave the pictures behind. */}
              <Field label="SKU" value={part.sku} />
              {editingHeader ? (
                <EditField label="Manufacturer" className="sm:col-span-2">
                  <Input {...register('manufacturer')} />
                </EditField>
              ) : (
                <Field label="Manufacturer" value={group.manufacturer || '—'} />
              )}
              {/* Both locations sit side by side: the warehouse bin is where the part came
                  from and is never overwritten, the recovery bin is where it now sits. */}
              {!editingHeader && (
                <>
                  <Field
                    label="Site"
                    value={multiLocation ? `${group.locations.length} sites` : part.inventorySite || '—'}
                  />
                  <Field
                    label="Warehouse Bin"
                    value={
                      multiLocation
                        ? group.locations.map((l) => l.binLocation || '—').join(', ')
                        : part.binLocation || '—'
                    }
                  />
                  <Field
                    label="Recovery Bin"
                    value={group.newBinLocation || '—'}
                    tone={group.newBinLocation ? 'positive' : undefined}
                  />
                  <Field
                    label="System QOH"
                    value={String(group.qoh)}
                    tone={multiLocation ? 'positive' : undefined}
                  />
                </>
              )}
              {editingHeader && (
                <EditField label="Description" className="sm:col-span-3">
                  <Input {...register('description')} />
                </EditField>
              )}
            </div>
            {/* Site, bin and quantity belong to a specific row, so they are edited per
                location rather than once for the whole SKU. */}
            {editingHeader && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <span className="block text-xs font-semibold text-textMuted">
                  {multiLocation ? 'Locations' : 'Location'}
                </span>
                {group.locations.map((loc, i) => (
                  <div
                    key={loc.id}
                    className={cn(
                      'grid grid-cols-2 gap-2 sm:grid-cols-[2fr_2fr_1fr]',
                      // A rule between locations so three stacked blocks don't read as one
                      // long run of identical fields on a phone.
                      i > 0 && 'border-t border-border pt-2 sm:border-0 sm:pt-0'
                    )}
                  >
                    <EditField label="Site" className="col-span-2 sm:col-span-1">
                      <Input {...register(`locations.${i}.inventorySite` as const)} />
                    </EditField>
                    <EditField label="Warehouse Bin">
                      <Input {...register(`locations.${i}.binLocation` as const)} />
                    </EditField>
                    <EditField label="System QOH">
                      <Input type="number" min={0} {...register(`locations.${i}.qoh` as const, { valueAsNumber: true })} />
                    </EditField>
                  </div>
                ))}
              </div>
            )}
            {/* The revenue/priority figures are reference material rather than something you
                act on mid-count, so on mobile they fold away once the form is scrolled.
                Desktop has the room and keeps them open. */}
            {hasRecoveryData && (
              <div
                className={cn(
                  'overflow-hidden transition-all duration-500 ease-in-out sm:max-h-40 sm:opacity-100',
                  summaryCollapsed ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100'
                )}
              >
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
                  <Field label="Revenue Priority" value={group.revenuePriorityRank != null ? `#${group.revenuePriorityRank}` : '—'} />
                  <Field label="Field Review Priority" value={group.fieldReviewPriority || '—'} />
                  <Field label="Recovery Price Basis" value={formatMoney(group.activeRecoveryPriceBasis)} />
                  <Field
                    label="Expected Gross Margin"
                    value={formatMoney(group.expectedGrossRecoveryMargin)}
                    tone={
                      group.expectedGrossRecoveryMargin == null
                        ? undefined
                        : group.expectedGrossRecoveryMargin < 0
                          ? 'negative'
                          : 'positive'
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          onScroll={handleFormScroll}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4"
        >
          {/* Listing performance, shown for anything on eBay rather than only finished
              parts: 36 of the 40 listed are still mid-workflow, so gating this on
              Completed would hide it from almost every active listing. */}
          {part.itemListed && (
            <div className="rounded-card border border-border bg-surfaceMuted p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-textPri">
                  <Tag size={13} />
                  Active on eBay
                </span>
                {part.ebayListingId && (
                  <span className="font-mono text-[11px] text-textMuted">{part.ebayListingId}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-textMuted">Days Listed</div>
                  <div className="font-semibold text-textPri">
                    {daysListed(part.itemListedDate) ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-textMuted">Asking</div>
                  <div className="font-semibold text-textPri">
                    {formatMoney(group.activeRecoveryPriceBasis)}
                  </div>
                </div>
                <div>
                  <div className="text-textMuted">Listed</div>
                  <div className="font-semibold text-textPri">
                    {part.itemListedDate ? part.itemListedDate.slice(0, 10) : '—'}
                  </div>
                </div>
              </div>
              {/* Orders and fees are synced; watchers, views and offers come from separate
                  eBay APIs that are not wired up yet. The panel is shaped for them so
                  adding them is a fill-in rather than a redesign. */}
              <p className="mt-2 border-t border-border pt-2 text-[11px] text-textMuted">
                Watchers, views and offers are not synced yet.
              </p>
            </div>
          )}

          {/* Only present once something has actually sold — an empty sales panel on
              two thousand unsold parts would be pure noise. */}
          {partSales.length > 0 && (
            <div className="rounded-card border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <ShoppingCart size={13} />
                  {sold.soldOut ? 'Sold Out' : 'Partially Sold'}
                </span>
                <span className="text-xs font-semibold text-emerald-800">
                  {sold.soldQty} sold · {sold.remainingQty} left
                </span>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-textMuted">Gross</div>
                  <div className="font-semibold text-textPri">{formatMoney(sold.totals.gross)}</div>
                </div>
                <div>
                  <div className="text-textMuted">Net Proceeds</div>
                  <div className="font-semibold text-emerald-700">{formatMoney(sold.totals.net)}</div>
                </div>
                <div>
                  <div className="text-textMuted">Orders</div>
                  <div className="font-semibold text-textPri">{sold.totals.orders}</div>
                </div>
              </div>
              <div className="space-y-1 border-t border-emerald-200 pt-2">
                {partSales.map((sale) => (
                  <div key={sale.lineItemId} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-textMuted">
                      {sale.soldAt.slice(0, 10)} · {sale.qtySold} @ {formatMoney(sale.grossSale)}
                    </span>
                    <span className="font-medium text-textPri">
                      {formatMoney(sale.netProceeds)}
                      {sale.feesEstimated && (
                        <span className="ml-1 font-normal text-textMuted" title="eBay has not posted the fee record yet">
                          est.
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PhotoUploader sku={part.sku} itemId={part.id} photos={part.photos} site={part.inventorySite} />

          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">
              Confirmed Quantity On Hand
              {multiLocation && (
                <span className="ml-1 font-normal text-textMuted">
                  — {part.inventorySite} · {part.binLocation || 'no bin'} ({part.qoh})
                </span>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Controller
                control={control}
                name="confirmedQoh"
                render={({ field }) => (
                  <QtyStepper
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      // Changing the count invalidates a prior confirmation — they need to
                      // re-confirm the number they actually landed on.
                      setValue('qohConfirmed', false, { shouldDirty: true });
                    }}
                  />
                )}
              />
              {/* Icon-only and fixed-size in both states: a "Confirm" -> "Confirmed" label
                  change grew the button mid-row on mobile and pushed the layout down. */}
              <Controller
                control={control}
                name="qohConfirmed"
                render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => field.onChange(!field.value)}
                    aria-pressed={field.value}
                    aria-label={field.value ? 'Quantity confirmed — tap to undo' : 'Confirm this quantity'}
                    title={field.value ? 'Confirmed — tap to undo' : 'Confirm this quantity'}
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border transition-colors',
                      field.value
                        ? 'border-primary bg-primary text-white hover:bg-primaryHover'
                        : 'border-border text-textMuted hover:bg-surfaceMuted'
                    )}
                  >
                    <Check size={18} />
                  </button>
                )}
              />
              {/* Live variance, updating as the stepper moves so the counter sees the
                  shortfall before committing. Same height as the controls beside it. */}
              {liveDiscrepancy && liveDiscrepancy.kind !== 'none' && (
                <span
                  className={cn(
                    'flex h-11 shrink-0 items-center gap-1.5 rounded-btn px-3 text-xs font-semibold',
                    liveDiscrepancy.variance < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  )}
                >
                  <AlertTriangle size={14} />
                  {formatVariance(liveDiscrepancy.variance)}
                </span>
              )}
            </div>
            {liveDiscrepancy && liveDiscrepancy.kind !== 'none' ? (
              <p
                className={cn(
                  'mt-1 text-[11px] font-medium',
                  liveDiscrepancy.variance < 0 ? 'text-red-700' : 'text-amber-700'
                )}
              >
                {liveDiscrepancy.kind === 'notFound'
                  ? `None found — system expects ${part.qoh}.`
                  : `System expects ${part.qoh}, counted ${watch('confirmedQoh')}.`}
              </p>
            ) : (
              !watch('qohConfirmed') && (
                <p className="mt-1 text-[11px] text-textMuted">Tap the check once you've counted this quantity.</p>
              )
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">Exception Reason</label>
            <Controller
              control={control}
              name="disposition"
              render={({ field }) => (
                <SelectDropdown
                  groups={EXCEPTION_GROUPS}
                  placeholder={EXCEPTION_PLACEHOLDER}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          {disposition === 'Other' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Exception Notes</label>
              <Input placeholder="Describe the reason" {...register('dispositionNote')} />
            </div>
          )}

          {needsReview && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Why does this need review?</label>
              <Input placeholder="What should the reviewer look at?" {...register('needsReviewNote')} />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">Notes</label>
            <Textarea rows={3} {...register('notes')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Item Condition</label>
              <Controller
                control={control}
                name="itemCondition"
                render={({ field }) => (
                  <SelectDropdown
                    options={ITEM_CONDITIONS}
                    placeholder={CONDITION_PLACEHOLDER}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Box Condition</label>
              <Controller
                control={control}
                name="boxCondition"
                render={({ field }) => (
                  <SelectDropdown
                    options={BOX_CONDITIONS}
                    placeholder={CONDITION_PLACEHOLDER}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Transferred To Market Recovery</label>
              <Controller
                control={control}
                name="transferredToMarketRecovery"
                render={({ field }) => (
                  <SelectDropdown
                    options={YES_NO}
                    mutedValue="No"
                    value={field.value ? 'Yes' : 'No'}
                    onChange={(v) => field.onChange(v === 'Yes')}
                  />
                )}
              />
            </div>
            {transferred && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-textMuted">Transfer ID</label>
                <Input placeholder="Cetaris Transfer ID" {...register('transferId')} />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">New Bin Location</label>
              <Controller
                control={control}
                name="newBinLocation"
                render={({ field }) => (
                  <ComboBox
                    options={IRON_BARN_BINS}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    label="New Bin Location"
                    placeholder="Iron Barn shelf, e.g. A-1-1"
                  />
                )}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Item Listed</label>
              <Controller
                control={control}
                name="itemListed"
                render={({ field }) => (
                  <SelectDropdown
                    options={YES_NO}
                    mutedValue="No"
                    value={field.value ? 'Yes' : 'No'}
                    onChange={(v) => field.onChange(v === 'Yes')}
                  />
                )}
              />
            </div>
            {itemListed && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-textMuted">eBay Listing ID</label>
                <Input placeholder="eBay Listing ID" {...register('ebayListingId')} />
              </div>
            )}

            {itemListed && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-textMuted">Item Listed Date</label>
                <input
                  type="date"
                  className="w-full rounded-btn border border-border bg-surface px-3 py-2 text-xs"
                  {...register('itemListedDate')}
                />
              </div>
            )}
          </div>
        </form>

        {/* Four buttons don't fit one phone-width row, and letting them wrap left them
            ragged and unevenly sized. On mobile they become two even pairs stacked with
            Cancel/Save on top, so the actions you reach for most are nearest the thumb and
            Delete is furthest from it. Desktop keeps the original single row. */}
        <div className="shrink-0 border-t border-border p-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={deletePart.isPending}
                type="button"
                className="w-full sm:w-auto"
              >
                <Trash2 size={14} />
                Delete Record
              </Button>
              {/* Sits with Delete because both are decisions about the record rather than
                  edits to it — but this one is reversible, so it toggles instead of asking. */}
              <Controller
                control={control}
                name="needsReview"
                render={({ field }) => (
                  <Button
                    variant={field.value ? undefined : 'outline'}
                    onClick={() => field.onChange(!field.value)}
                    type="button"
                    aria-pressed={field.value}
                    className={cn('w-full sm:w-auto', field.value && 'bg-purple-600 hover:bg-purple-700')}
                  >
                    <Flag size={14} />
                    {field.value ? 'Needs Review' : 'Flag for Review'}
                  </Button>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button variant="outline" onClick={close} type="button" className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={savePart.isPending} type="button" className="w-full sm:w-auto">
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function EditField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-0.5 text-xs text-textMuted">{label}</div>
      {children}
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div>
      <div className="text-xs text-textMuted">{label}</div>
      <div
        className={cn(
          'font-medium',
          tone === 'positive' ? 'text-primary' : tone === 'negative' ? 'text-red-600' : 'text-textPri'
        )}
      >
        {value}
      </div>
    </div>
  );
}
