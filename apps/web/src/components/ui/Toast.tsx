import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useToastStore } from '../../state/useToastStore';
import { cn } from '../../lib/cn';

export function Toast() {
  const { message, variant, clear } = useToastStore();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, 3000);
    return () => clearTimeout(timer);
  }, [message, clear]);

  if (!message) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-card px-4 py-3 text-sm font-medium text-white shadow-lg',
        variant === 'success' ? 'bg-primaryDeep' : 'bg-red-600'
      )}
      role="status"
    >
      {variant === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      {message}
    </div>
  );
}
