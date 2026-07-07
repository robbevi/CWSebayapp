import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { useInventoryParts } from '../hooks/useInventoryParts';
import { useSavePart } from '../hooks/useSavePart';
import { useUIStore } from '../state/useUIStore';
import { Button } from './ui/Button';
import { Dropdown } from './ui/Dropdown';
import { Textarea } from './ui/Textarea';
import { PhotoUploader } from './PhotoUploader';
import { QtyStepper } from './QtyStepper';

const CONDITIONS = ['', 'New', 'LikeNew', 'Good', 'Fair', 'Poor', 'ForParts'];

const schema = z.object({
  confirmedQoh: z.number().min(0),
  notes: z.string().optional(),
  boxCondition: z.string().optional(),
  transferredToMarketRecovery: z.boolean(),
  itemListed: z.boolean(),
  itemListedDate: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function PartDetailModal() {
  const { selectedId, modalOpen, set } = useUIStore();
  const { data: parts } = useInventoryParts();
  const savePart = useSavePart();

  const part = parts?.find((p) => p.id === selectedId);

  const { register, control, handleSubmit, reset, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      confirmedQoh: 0,
      notes: '',
      boxCondition: '',
      transferredToMarketRecovery: false,
      itemListed: false,
      itemListedDate: '',
    },
  });

  useEffect(() => {
    if (part) {
      reset({
        confirmedQoh: part.confirmedQoh ?? part.qoh,
        notes: part.notes ?? '',
        boxCondition: part.boxCondition ?? '',
        transferredToMarketRecovery: part.transferredToMarketRecovery,
        itemListed: part.itemListed,
        itemListedDate: part.itemListedDate ?? '',
      });
    }
  }, [part, reset]);

  if (!modalOpen || !part) return null;

  const itemListed = watch('itemListed');

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
        boxCondition: values.boxCondition || undefined,
        transferredToMarketRecovery: values.transferredToMarketRecovery,
        itemListed: values.itemListed,
        itemListedDate: values.itemListed ? values.itemListedDate || new Date().toISOString() : null,
      },
    });
    set({ modalOpen: false, selectedId: null });
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 sm:p-6">
      <div className="flex h-full w-full flex-col overflow-y-auto bg-surface sm:h-auto sm:max-h-[90vh] sm:w-[720px] sm:rounded-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <div className="text-lg font-semibold text-textPri">{part.sku}</div>
            <div className="text-sm text-textMuted">
              Bin {part.binLocation || '—'} · {part.description}
            </div>
          </div>
          <button onClick={close} className="rounded-btn p-2 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 space-y-5 p-4">
          <div className="grid grid-cols-2 gap-3 rounded-card bg-surfaceMuted p-3 text-sm sm:grid-cols-4">
            <Field label="SKU" value={part.sku} />
            <Field label="Bin" value={part.binLocation || '—'} />
            <Field label="System QOH" value={String(part.qoh)} />
            <Field label="Site" value={part.inventorySite || '—'} />
          </div>

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
            <label className="mb-1 block text-xs font-semibold text-textMuted">Notes</label>
            <Textarea rows={3} {...register('notes')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Box Condition</label>
              <Dropdown options={CONDITIONS} {...register('boxCondition')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Transferred To Market Recovery</label>
              <Controller
                control={control}
                name="transferredToMarketRecovery"
                render={({ field }) => (
                  <Dropdown
                    options={['No', 'Yes']}
                    value={field.value ? 'Yes' : 'No'}
                    onChange={(e) => field.onChange(e.target.value === 'Yes')}
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
                  <Dropdown
                    options={['No', 'Yes']}
                    value={field.value ? 'Yes' : 'No'}
                    onChange={(e) => field.onChange(e.target.value === 'Yes')}
                  />
                )}
              />
            </div>
            {itemListed && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-textMuted">Item Listed Date</label>
                <input
                  type="date"
                  className="w-full rounded-btn border border-border bg-surface px-3 py-2 text-sm"
                  {...register('itemListedDate')}
                />
              </div>
            )}
          </div>
        </form>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={close} type="button">
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={savePart.isPending} type="button">
            Save
          </Button>
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
