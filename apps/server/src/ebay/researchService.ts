import { agentPrompt, parseAgentOutput, type PartGroup, type ResearchResult } from '@warehouse/shared';
import { env } from '../config/env.js';
import { getDriveUploadClient } from '../google/client.js';

/**
 * Research through the Copilot Studio workflow "SPARE Parts Research".
 *
 * SPARE posts a part to the workflow's HTTP trigger; the workflow runs the eBay Parts
 * Researcher agent and saves its reply to Google Drive as "<SKU>.md" in the SPARE
 * Research folder. SPARE never waits on the agent — research takes minutes — it only
 * sends the request and later reads whatever file is newest for the SKU.
 *
 * The trigger's URL carries the workflow's access signature, so it lives only in the
 * environment (SPARE_RESEARCH_URL), never in code or logs.
 */

export function isResearchConfigured(): boolean {
  return !!env.researchUrl;
}

export async function requestResearch(group: PartGroup): Promise<{ requestedAt: string }> {
  if (!env.researchUrl) throw new Error('Copilot research is not configured. Set SPARE_RESEARCH_URL.');
  const requestedAt = new Date().toISOString();
  let res: Response;
  try {
    res = await fetch(env.researchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: group.sku, requestedAt, message: agentPrompt(group) }),
    });
  } catch (err) {
    // fetch's own errors quote the URL, signature and all, and this one reaches the app.
    const bad = err instanceof TypeError && /parse URL/i.test(err.message);
    throw new Error(
      bad
        ? 'SPARE_RESEARCH_URL is not a valid URL. Its value should be just the https:// address.'
        : "Couldn't reach the Copilot research workflow."
    );
  }
  if (!res.ok) {
    // The body may echo the request URL; keep only the status and a short, URL-free reason.
    const reason = (await res.text()).replace(/https?:\/\/\S+/g, '[url]').slice(0, 200);
    throw new Error(`Copilot research request failed (${res.status}): ${reason}`);
  }
  return { requestedAt };
}

const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** The newest research file for a SKU, read and parsed. Null when there is none yet. */
export async function latestResearch(sku: string): Promise<ResearchResult | null> {
  const drive = getDriveUploadClient();
  const list = await drive.files.list({
    q: `'${quote(env.researchFolderId)}' in parents and name = '${quote(`${sku}.md`)}' and trashed = false`,
    orderBy: 'createdTime desc',
    pageSize: 1,
    fields: 'files(id,createdTime,mimeType)',
  });
  const file = list.data.files?.[0];
  if (!file?.id) return null;

  const content = file.mimeType?.startsWith('application/vnd.google-apps')
    ? (await drive.files.export({ fileId: file.id, mimeType: 'text/plain' }, { responseType: 'text' })).data
    : (await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' })).data;

  const parsed = parseAgentOutput(String(content ?? ''));
  return {
    found: true,
    createdAt: file.createdTime ?? new Date(0).toISOString(),
    listing: parsed.listing,
    notes: parsed.notes,
    error: parsed.error,
  };
}
