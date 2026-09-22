import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigBanner } from './components/ConfigBanner';
import { FilterPanel } from './components/FilterPanel';
import { GoalsPopup } from './components/GoalsPopup';
import { Header } from './components/Header';
import { KanbanBoard } from './components/KanbanBoard';
import { StatStrip } from './components/StatStrip';
import { PartDetailModal } from './components/PartDetailModal';
import { LoginScreen } from './components/LoginScreen';
import { Toast } from './components/ui/Toast';
import { useInventoryParts } from './hooks/useInventoryParts';
import { fetchMe, SIGNED_OUT_EVENT } from './lib/api';
import { useUIStore } from './state/useUIStore';
import { useUserStore } from './state/useUserStore';

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
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-6 py-4 lg:gap-3 lg:py-3 lg:min-h-0 lg:overflow-hidden">
          <StatStrip />
          <FilterPanel />
          <ConfigBanner />
          <div className="lg:min-h-0 lg:flex-1">
            <KanbanBoard />
          </div>
        </div>
      </div>
      <PartDetailModal />
      <GoalsPopup />
      <Toast />
      <DeepLinkHandler />
    </>
  );
}

/**
 * Nothing of the app shows until the server confirms who is signed in. A 401 from any
 * request later (the session expired, or the person was taken off the roster) brings
 * sign-in back, and cached data is dropped so the next person never sees the last one's.
 */
function AuthGate() {
  const session = useUserStore((s) => s.session);
  const checked = useUserStore((s) => s.checked);
  const setSession = useUserStore((s) => s.setSession);

  useEffect(() => {
    fetchMe()
      .then(setSession)
      .catch(() => setSession(null));
    const signedOut = () => {
      qc.clear();
      setSession(null);
    };
    window.addEventListener(SIGNED_OUT_EVENT, signedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
  }, [setSession]);

  if (!checked) {
    return <div className="flex h-screen items-center justify-center bg-surfaceMuted text-sm text-textMuted">Loading…</div>;
  }
  if (!session) {
    return (
      <LoginScreen
        onSignedIn={(s) => {
          qc.clear();
          setSession(s);
        }}
      />
    );
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthGate />
    </QueryClientProvider>
  );
}
