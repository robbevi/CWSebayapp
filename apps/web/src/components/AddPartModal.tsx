import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreatePart } from '../hooks/useCreatePart';
import { useUIStore } from '../state/useUIStore';
import { Button } from './ui/Button';
import { ComboBox } from './ui/ComboBox';
import { Input } from './ui/Input';

const DEFAULT_SITE = 'NDPARTS - Williston Parts';

interface AddPartModalProps {
  onClose: () => void;
  manufacturerOptions: string[];
  siteOptions: string[];
}

export function AddPartModal({ onClose, manufacturerOptions, siteOptions }: AddPartModalProps) {
  const createPart = useCreatePart();
  const setUI = useUIStore((s) => s.set);
  const [step, setStep] = useState<'form' | 'prompt'>('form');
  const [sku, setSku] = useState('');
  const [binLocation, setBinLocation] = useState('');
  const [qoh, setQoh] = useState('0');
  const [manufacturer, setManufacturer] = useState('');
  const [inventorySite, setInventorySite] = useState(DEFAULT_SITE);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const submit = async () => {
    const trimmedSku = sku.trim();
    if (!trimmedSku) return;
    try {
      const created = await createPart.mutateAsync({
        sku: trimmedSku,
        binLocation: binLocation.trim() || undefined,
        qoh: Number(qoh) || 0,
        manufacturer: manufacturer.trim() || undefined,
        inventorySite: inventorySite.trim() || undefined,
      });
      setCreatedId(created.id);
      setStep('prompt');
    } catch {
      // toast already shown by useCreatePart's onError
    }
  };

  const openDetail = () => {
    if (!createdId) return;
    setUI({ selectedId: createdId, modalOpen: true });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-card bg-surface">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-semibold text-textPri">{step === 'form' ? 'Add Part' : 'Part Added'}</h2>
          <button onClick={onClose} className="rounded-btn p-2 hover:bg-surfaceMuted" aria-label="Close" type="button">
            <X size={18} />
          </button>
        </div>

        {step === 'form' ? (
          <div className="space-y-4 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">SKU</label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Bin Location</label>
              <Input value={binLocation} onChange={(e) => setBinLocation(e.target.value)} placeholder="Bin Location" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Quantity On Hand</label>
              <Input type="number" min={0} value={qoh} onChange={(e) => setQoh(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Manufacturer</label>
              <ComboBox
                options={manufacturerOptions}
                value={manufacturer}
                onChange={setManufacturer}
                placeholder="Manufacturer"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-textMuted">Inventory Site</label>
              <ComboBox options={siteOptions} value={inventorySite} onChange={setInventorySite} placeholder="Inventory Site" />
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm text-textPri">
              <span className="font-semibold">{sku}</span> was added. Would you like to add photos and notes now?
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border p-4">
          {step === 'form' ? (
            <>
              <Button variant="outline" onClick={onClose} type="button">
                Cancel
              </Button>
              <Button onClick={submit} disabled={!sku.trim() || createPart.isPending} type="button">
                {createPart.isPending ? 'Adding…' : 'Add Part'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} type="button">
                Not Now
              </Button>
              <Button onClick={openDetail} type="button">
                Add Photos & Notes
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
