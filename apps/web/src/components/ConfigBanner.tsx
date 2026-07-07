import { AlertTriangle } from 'lucide-react';
import { useHealth } from '../hooks/useHealth';

export function ConfigBanner() {
  const { data } = useHealth();
  if (!data) return null;
  if (data.graphConfigured && data.siteResolved && data.listResolved && data.driveResolved) return null;

  const message = !data.graphConfigured
    ? 'SharePoint/Graph is not configured for this environment. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and the SHAREPOINT_* variables in .env, then restart the server. Showing sample data for now.'
    : data.error || 'Could not resolve the SharePoint site, list, or photo library. Check the SHAREPOINT_* environment variables.';

  return (
    <div className="flex items-start gap-3 rounded-card border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
