import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, X } from 'lucide-react';
import { useDeletePart } from '../hooks/useDeletePart';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useSavePart } from '../hooks/useSavePart';
import { useUIStore } from '../state/useUIStore';
import { useUserStore } from '../state/useUserStore';
import { Button } from './ui/Button';
import { SelectDropdown } from './ui/SelectDropdown';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { PhotoUploader } from './PhotoUploader';
import { QtyStepper } from './QtyStepper';

const ITEM_CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor', 'For Parts'];
const BOX_CONDITIONS = ['Excellent', 'Very Good', 'Good', 'Poor', 'No Box'];
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
  notes: z.string().optional(),
  itemCondition: z.string().optional(),
  boxCondition: z.string().optional(),
  disposition: z.string().optional(),
  dispositionNote: z.string().optional(),
  transferredToMarketRecovery: z.boolean(),
  transferId: z.string().optional(),
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

  const { register, control, handleSubmit, reset, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      confirmedQoh: 0,
      notes: '',
      itemCondition: '',
      boxCondition: '',
      disposition: '',
      dispositionNote: '',
      transferredToMarketRecovery: false,
      transferId: '',
      itemListed: false,
      itemListedDate: '',
      ebayListingId: '',
    },
  });

  useEffect(() => {
    if (part) {
      reset({
        confirmedQoh: part.confirmedQoh ?? part.qoh,
        notes: part.notes ?? '',
        itemCondition: part.itemCondition ?? '',
        boxCondition: part.boxCondition ?? '',
        disposition: part.disposition ?? '',
        dispositionNote: part.dispositionNote ?? '',
        transferredToMarketRecovery: part.transferredToMarketRecovery,
        transferId: part.transferId ?? '',
        itemListed: part.itemListed,
        itemListedDate: part.itemListedDate ?? '',
        ebayListingId: part.ebayListingId ?? '',
      });
    }
  }, [part, reset]);

  if (!modalOpen || !part) return null;

  const itemListed = watch('itemListed');
  const transferred = watch('transferredToMarketRecovery');
  const disposition = watch('disposition');

  const close = () => {
    if (formState.isDirty && !window.confirm('Discard unsaved changes?')) return;
    set({ modalOpen: false, selectedId: null });
  };

  const onSubmit = handleSubmit(async (values) => {
    await savePart.mutateAsync({
      id: part.id,
      patch: {
        confirmedQoh: values.confirmedQoh,
        notes: values.notes,
        itemCondition: values.itemCondition || undefined,
        boxCondition: values.boxCondition || undefined,
        disposition: values.disposition || undefined,
        dispositionNote: values.disposition === 'Other' ? values.dispositionNote || undefined : undefined,
        transferredToMarketRecovery: values.transferredToMarketRecovery,
        transferId: values.transferredToMarketRecovery ? values.transferId || undefined : null,
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
              Bin {part.binLocation || '—'} · {part.description}
            </div>
          </div>
          <button onClick={close} className="rounded-btn p-2 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-border p-4">
          <div className="grid grid-cols-2 gap-3 rounded-card bg-surfaceMuted p-3 text-xs sm:grid-cols-5">
            <Field label="SKU" value={part.sku} />
            <Field label="Manufacturer" value={part.manufacturer || '—'} />
            <Field label="Bin" value={part.binLocation || '—'} />
            <Field label="System QOH" value={String(part.qoh)} />
            <Field label="Site" value={part.inventorySite || '—'} />
          </div>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <PhotoUploader sku={part.sku} itemId={part.id} photos={part.photos} />

          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">Confirmed Quantity On Hand</label>
            <Controller
              control={control}
              name="confirmedQoh"
              render={({ field }) => <QtyStepper value={field.value} onChange={field.onChange} />}
            />
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
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deletePart.isPending}
            type="button"
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-textMuted">{label}</div>
      <div className="font-medium text-textPri">{value}</div>
    </div>
  );
}
