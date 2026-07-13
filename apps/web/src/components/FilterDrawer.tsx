import { Camera, ClipboardCheck, Factory, ListChecks, MapPin, Tag, TruckIcon, Wrench, X } from 'lucide-react';
import type { TaskKey, WorkflowStatus } from '@warehouse/shared';
import { Button } from './ui/Button';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';

export const STATUS_OPTIONS: { key: WorkflowStatus; label: string }[] = [
  { key: 'NotStarted', label: 'Not Started' },
  { key: 'Processing', label: 'Processing' },
  { key: 'Completed', label: 'Completed' },
];

export const TASK_OPTIONS: { key: TaskKey; label: string; icon: React.ReactNode }[] = [
  { key: 'photographed', label: 'Photos taken', icon: <Camera size={14} /> },
  { key: 'qtyConfirmed', label: 'Quantity confirmed', icon: <ListChecks size={14} /> },
  { key: 'conditionSet', label: 'Condition set', icon: <ClipboardCheck size={14} /> },
  { key: 'transferred', label: 'Transferred', icon: <TruckIcon size={14} /> },
  { key: 'listed', label: 'eBay listed', icon: <Tag size={14} /> },
];

interface FilterDrawerProps {
  onClose: () => void;
  onClearAll: () => void;
  siteOptions: string[];
  siteCounts: Record<string, number>;
  sites: string[];
  onSitesChange: (next: string[]) => void;
  binOptions: string[];
  binCounts: Record<string, number>;
  bins: string[];
  onBinsChange: (next: string[]) => void;
  mfrOptions: string[];
  mfrCounts: Record<string, number>;
  manufacturers: string[];
  onManufacturersChange: (next: string[]) => void;
  statuses: WorkflowStatus[];
  onToggleStatus: (key: WorkflowStatus) => void;
  missingTasks: TaskKey[];
  onToggleTask: (key: TaskKey) => void;
}

export function FilterDrawer({
  onClose,
  onClearAll,
  siteOptions,
  siteCounts,
  sites,
  onSitesChange,
  binOptions,
  binCounts,
  bins,
  onBinsChange,
  mfrOptions,
  mfrCounts,
  manufacturers,
  onManufacturersChange,
  statuses,
  onToggleStatus,
  missingTasks,
  onToggleTask,
}: FilterDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-card bg-surface sm:max-w-md sm:rounded-card">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-semibold text-textPri">Filters</h2>
          <div className="flex items-center gap-4">
            <button type="button" onClick={onClearAll} className="text-xs font-semibold text-primary hover:underline">
              Clear All
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-btn p-1 hover:bg-surfaceMuted"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">Inventory Site</label>
            <MultiSelectDropdown
              icon={<Factory size={14} />}
              label="Inventory Site"
              options={siteOptions}
              selected={sites}
              counts={siteCounts}
              onChange={onSitesChange}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">Bin Location</label>
            <MultiSelectDropdown
              icon={<MapPin size={14} />}
              label="Bin Location"
              options={binOptions}
              selected={bins}
              counts={binCounts}
              onChange={onBinsChange}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-textMuted">Manufacturer</label>
            <MultiSelectDropdown
              icon={<Wrench size={14} />}
              label="Manufacturer"
              options={mfrOptions}
              selected={manufacturers}
              counts={mfrCounts}
              onChange={onManufacturersChange}
            />
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-textMuted">Status</span>
            <div className="space-y-2 rounded-btn border border-border p-3">
              {STATUS_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-xs text-textPri">
                  <input
                    type="checkbox"
                    checked={statuses.includes(opt.key)}
                    onChange={() => onToggleStatus(opt.key)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-textMuted">Tasks Completed</span>
            <div className="space-y-2 rounded-btn border border-border p-3">
              {TASK_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-xs text-textPri">
                  <input
                    type="checkbox"
                    checked={missingTasks.includes(opt.key)}
                    onChange={() => onToggleTask(opt.key)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="text-textMuted">{opt.icon}</span>
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-textMuted">Check a box to show only parts missing that step.</p>
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-4">
          <Button onClick={onClose} type="button" className="w-full">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
