import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { useImportCsv } from '../hooks/useImportCsv';
import type { ImportResult } from '../lib/api';
import { Button } from './ui/Button';

export function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importCsv = useImportCsv();
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    const res = await importCsv.mutateAsync(file);
    setResult(res);
  };

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-textPri">Import InventoryPart CSV</div>
          <div className="text-sm text-textMuted">
            Loads the legacy export into the SharePoint list. Safe to re-run — matches existing rows by Inventory
            Part ID / SKU.
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importCsv.isPending}>
          <UploadCloud size={16} />
          {importCsv.isPending ? 'Importing…' : 'Import CSV'}
        </Button>
      </div>

      {result && (
        <div className="mt-3 rounded-btn bg-surfaceMuted p-3 text-sm">
          {result.totalRows} rows processed — {result.created} created, {result.updated} updated
          {result.errors.length > 0 && (
            <div className="mt-1 text-red-700">
              {result.errors.length} row(s) failed: {result.errors.slice(0, 3).map((e) => e.sku).join(', ')}
              {result.errors.length > 3 ? '…' : ''}
            </div>
          )}
        </div>
      )}
      {importCsv.isError && (
        <div className="mt-3 rounded-btn bg-red-50 p-3 text-sm text-red-700">
          {importCsv.error instanceof Error ? importCsv.error.message : 'Import failed'}
        </div>
      )}
    </div>
  );
}
