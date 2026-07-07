export function BrandedHeader() {
  return (
    <div className="relative -mx-6 bg-primaryDeep px-6 pb-10 pt-6">
      <div className="mx-auto flex max-w-5xl items-center gap-4 rounded-card bg-surface p-4 shadow-md">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card bg-surface text-sm font-bold tracking-tight text-primaryDeep ring-1 ring-border">
          CALFRAC
        </div>
        <div>
          <h1 className="text-lg font-semibold text-textPri">Calfrac eBay Inventory App</h1>
          <p className="text-sm text-textMuted">Triage warehouse parts for eBay resale</p>
        </div>
      </div>
    </div>
  );
}
