import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Check, Trash2, X } from 'lucide-react';
import { formatVariance, getDiscrepancy, IRON_BARN_BINS } from '@warehouse/shared';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDeletePart } from '../hooks/useDeletePart';
import { useInventoryParts } from '../hooks/useInventoryParts';
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
  const savePart = useSavePart();
  const deletePart = useDeletePart();
  const currentUser = useUserStore((s) => s.currentUser);

  const part = parts?.find((p) => p.id === selectedId);
  useBodyScrollLock(modalOpen && !!part);

  const { register, control, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
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
    if (part) {
      reset({
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
    }
  }, [part, reset]);

  if (!modalOpen || !part) return null;

  const itemListed = watch('itemListed');
  const transferred = watch('transferredToMarketRecovery');
  const disposition = watch('disposition');

  // Only meaningful once they've confirmed — before that the stepper still holds the
  // pre-filled system quantity, and flagging "0 vs 5" while they're mid-count is noise.
  const qohConfirmed = watch('qohConfirmed');
  const liveDiscrepancy = qohConfirmed ? getDiscrepancy({ qoh: part.qoh, confirmedQoh: watch('confirmedQoh') }) : null;

  // Parts loaded before the recovery columns existed have none of these — hide the whole
  // row rather than show four em-dashes.
  const hasRecoveryData =
    part.revenuePriorityRank != null ||
    !!part.fieldReviewPriority ||
    part.activeRecoveryPriceBasis != null ||
    part.expectedGrossRecoveryMargin != null;

  const close = () => {
    if (formState.isDirty && !window.confirm('Discard unsaved changes?')) return;
    set({ modalOpen: false, selectedId: null });
  };

  const onSubmit = handleSubmit(async (values) => {
    await savePart.mutateAsync({
      id: part.id,
      patch: {
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
      },
      submittedBy: currentUser ?? undefined,
    });
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
              Bin {part.binLocation || '—'}
              {part.newBinLocation && <span className="text-primary"> → {part.newBinLocation}</span>} ·{' '}
              {part.description}
            </div>
          </div>
          <button onClick={close} className="rounded-btn p-2 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-border p-4">
          <div className="space-y-3 rounded-card bg-surfaceMuted p-3 text-xs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Field label="SKU" value={part.sku} />
              <Field label="Manufacturer" value={part.manufacturer || '—'} />
              <Field label="Site" value={part.inventorySite || '—'} />
              {/* Both locations sit side by side: the warehouse bin is where the part came
                  from and is never overwritten, the recovery bin is where it now sits. */}
              <Field label="Warehouse Bin" value={part.binLocation || '—'} />
              <Field
                label="Recovery Bin"
                value={part.newBinLocation || '—'}
                tone={part.newBinLocation ? 'positive' : undefined}
              />
              <Field label="System QOH" value={String(part.qoh)} />
            </div>
            {hasRecoveryData && (
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
                <Field label="Revenue Priority" value={part.revenuePriorityRank != null ? `#${part.revenuePriorityRank}` : '—'} />
                <Field label="Field Review Priority" value={part.fieldReviewPriority || '—'} />
                <Field label="Recovery Price Basis" value={formatMoney(part.activeRecoveryPriceBasis)} />
                <Field
                  label="Expected Gross Margin"
                  value={formatMoney(part.expectedGrossRecoveryMargin)}
                  tone={
                    part.expectedGrossRecoveryMargin == null
                      ? undefined
                      : part.expectedGrossRecoveryMargin < 0
                        ? 'negative'
                        : 'positive'
                  }
                />
              </div>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
          <PhotoUploader sku={part.sku} itemId={part.id} photos={part.photos} site={part.inventorySite} />

          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">Confirmed Quantity On Hand</label>
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
              <Controller
                control={control}
                name="qohConfirmed"
                render={({ field }) =>
                  field.value ? (
                    <button
                      type="button"
                      onClick={() => field.onChange(false)}
                      title="Confirmed — click to undo"
                      className="flex items-center gap-1.5 rounded-btn border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
                    >
                      <Check size={14} />
                      Confirmed
                    </button>
                  ) : (
                    <Button variant="outline" type="button" onClick={() => field.onChange(true)}>
                      Confirm
                    </Button>
                  )
                }
              />
              {/* Live variance against the system quantity, updating as the stepper moves so
                  the counter sees the shortfall before they commit to it. */}
              {liveDiscrepancy && liveDiscrepancy.kind !== 'none' && (
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-btn px-3 py-2 text-xs font-semibold',
                    liveDiscrepancy.variance < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  )}
                >
                  <AlertTriangle size={14} />
                  {formatVariance(liveDiscrepancy.variance)} vs system ({part.qoh})
                  {liveDiscrepancy.kind === 'notFound' && ' — none found'}
                </span>
              )}
            </div>
            {!watch('qohConfirmed') && (
              <p className="mt-1 text-[11px] text-textMuted">Click Confirm once you've counted this quantity.</p>
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

        <div className="flex shrink-0 items-center justify-between border-t border-border p-4">
          <Button variant="danger" onClick={handleDelete} disabled={deletePart.isPending} type="button">
            <Trash2 size={14} />
            Delete Record
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} type="button">
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={savePart.isPending} type="button">
              Save
            </Button>
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
