import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppBar } from './components/AppBar';
import { BrandedHeader } from './components/BrandedHeader';
import { ConfigBanner } from './components/ConfigBanner';
import { FilterPanel } from './components/FilterPanel';
import { ImportPanel } from './components/ImportPanel';
import { KanbanBoard } from './components/KanbanBoard';
import { PartDetailModal } from './components/PartDetailModal';
import { Toast } from './components/ui/Toast';
import { useInventoryParts } from './hooks/useInventoryParts';
import { useUIStore } from './state/useUIStore';

const qc = new QueryClient();

function DeepLinkHandler() {
  const { data: parts } = useInventoryParts();
  const set = useUIStore((s) => s.set);

  useEffect(() => {
    if (!parts) return;
    const sku = new URLSearchParams(window.location.search).get('sku');
    if (!sku) return;
    const part = parts.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
    if (part) set({ selectedId: part.id, modalOpen: true });
  }, [parts, set]);

  return null;
}

function Dashboard() {
  return (
    <>
      <AppBar />
      <div className="mx-auto max-w-[1280px] px-6 pb-10">
        <BrandedHeader />
        <div className="h-4" />
        <FilterPanel />
        <div className="h-4" />
        <ConfigBanner />
        <div className="h-4" />
        <ImportPanel />
        <div className="h-4" />
        <KanbanBoard />
      </div>
      <PartDetailModal />
      <Toast />
      <DeepLinkHandler />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>
  );
}
