import { AlertTriangle } from 'lucide-react';
import { useHealth } from '../hooks/useHealth';

export function ConfigBanner() {
  const { data } = useHealth();
  if (!data) return null;
  if (data.configured && data.resolved) return null;

  const message = !data.configured
    ? 'No data backend is configured for this environment. Set either the GOOGLE_* variables (interim backend) or the AZURE_*/SHAREPOINT_* variables in .env, then restart the server. Showing sample data for now.'
    : data.error ||
      (data.backend === 'google'
        ? 'Could not reach the Google Sheet or Drive folder. Check GOOGLE_SERVICE_ACCOUNT_KEY_FILE, GOOGLE_SHEET_ID, GOOGLE_DRIVE_FOLDER_ID and that the sheet/folder are shared with the service account.'
        : 'Could not resolve the SharePoint site, list, or photo library. Check the SHAREPOINT_* environment variables.');

  return (
    <div className="flex items-start gap-3 rounded-card border-l-4 border-red-500 bg-red-50 p-4 text-xs text-red-800">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
