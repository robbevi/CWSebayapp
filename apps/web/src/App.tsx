import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigBanner } from './components/ConfigBanner';
import { FilterPanel } from './components/FilterPanel';
import { Header } from './components/Header';
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
      <div className="flex flex-col bg-surfaceMuted lg:h-screen lg:overflow-hidden">
        <Header />
        <div className="flex flex-1 flex-col gap-4 px-6 py-4 lg:min-h-0 lg:overflow-hidden">
          <FilterPanel />
          <ConfigBanner />
          <div className="lg:min-h-0 lg:flex-1">
            <KanbanBoard />
          </div>
        </div>
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
