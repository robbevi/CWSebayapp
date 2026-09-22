import { draftReadiness, groupPartsBySku, type PartGroup } from '@warehouse/shared';
import { env } from '../config/env.js';
import { getDriveUploadClient } from '../google/client.js';
import { getAllParts } from '../google/sheetsService.js';
import { isResearchConfigured, requestResearch } from './researchService.js';

/**
 * Researching the backlog: every part ready to list that Copilot hasn't written up yet.
 *
 * One part at a time, waiting for each reply to land in Drive before sending the next, so
 * the workflow is never asked to run several agents at once. Parts already researched are
 * skipped, which is also how a run resumes: nothing is remembered between runs, because
 * the files in Drive already say what is done. A restart — a deploy, or Render's free
 * plan sleeping — ends the run, and starting again picks up where it left off.
 */

/** Long enough for the agent, which usually answers in 2–4 minutes. */
const WAIT_MS = 8 * 60_000;
const POLL_MS = 30_000;
/** A breather between parts, so a stuck run can still be stopped promptly. */
const GAP_MS = 5_000;

export interface BatchStatus {
  running: boolean;
  /** How many parts this run was asked for; 0 when it has never run. */
  limit: number;
  sent: number;
  answered: number;
  failed: { sku: string; error: string }[];
  /** The part being researched now. */
  current: string | null;
  /** Ready-to-list parts with no research yet, as counted when the run started. */
  backlog: number;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
  stoppedBy: string | null;
}

const state: BatchStatus = {
  running: false,
  limit: 0,
  sent: 0,
  answered: 0,
  failed: [],
  current: null,
  backlog: 0,
  startedAt: null,
  finishedAt: null,
  startedBy: null,
  stoppedBy: null,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Every SKU with a research file already saved, in one listing rather than one call each. */
export async function researchedSkus(): Promise<Set<string>> {
  const drive = getDriveUploadClient();
  const found = new Set<string>();
  let pageToken: string | undefined;
  do {
    const list = await drive.files.list({
      q: `'${quote(env.researchFolderId)}' in parents and trashed = false`,
      pageSize: 1000,
      fields: 'nextPageToken, files(name)',
      pageToken,
    });
    for (const f of list.data.files ?? []) {
      if (f.name) found.add(f.name.replace(/\.md$/i, '').trim().toLowerCase());
    }
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken);
  return found;
}

/** Parts ready to list, oldest cataloguing first, that Copilot has not researched yet. */
export async function backlogGroups(): Promise<PartGroup[]> {
  const [groups, done] = await Promise.all([groupPartsBySku(await getAllParts()), researchedSkus()]);
  return groups.filter((g) => draftReadiness(g).ready && !done.has(g.sku.trim().toLowerCase()));
}

export function batchStatus(): BatchStatus {
  return { ...state, failed: [...state.failed] };
}

export function stopBatch(who: string): BatchStatus {
  if (state.running) {
    state.running = false;
    state.stoppedBy = who;
  }
  return batchStatus();
}

/** True once the SKU's research file exists. */
async function answered(sku: string): Promise<boolean> {
  const drive = getDriveUploadClient();
  const list = await drive.files.list({
    q: `'${quote(env.researchFolderId)}' in parents and name = '${quote(`${sku}.md`)}' and trashed = false`,
    pageSize: 1,
    fields: 'files(id)',
  });
  return !!list.data.files?.length;
}

async function run(groups: PartGroup[]): Promise<void> {
  for (const group of groups) {
    if (!state.running) break;
    state.current = group.sku;
    try {
      await requestResearch(group);
      state.sent += 1;
    } catch (err) {
      state.failed.push({ sku: group.sku, error: err instanceof Error ? err.message : 'Request failed' });
      // A workflow that refuses one part will refuse the rest; stop rather than burn the queue.
      break;
    }

    const until = Date.now() + WAIT_MS;
    let arrived = false;
    while (state.running && Date.now() < until && !arrived) {
      await sleep(POLL_MS);
      arrived = await answered(group.sku).catch(() => false);
    }
    if (arrived) state.answered += 1;
    else if (state.running) state.failed.push({ sku: group.sku, error: 'No reply from Copilot within 8 minutes' });
    await sleep(GAP_MS);
  }
  state.running = false;
  state.current = null;
  state.finishedAt = new Date().toISOString();
}

/** Starts a run of up to `limit` parts. Returns the status once the queue is known. */
export async function startBatch(limit: number, who: string): Promise<BatchStatus> {
  if (!isResearchConfigured()) throw new Error('Copilot research is not configured.');
  if (state.running) throw new Error('A research run is already going.');

  const queue = await backlogGroups();
  Object.assign(state, {
    running: true,
    limit,
    sent: 0,
    answered: 0,
    failed: [],
    current: null,
    backlog: queue.length,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    startedBy: who,
    stoppedBy: null,
  } satisfies BatchStatus);

  // Deliberately not awaited: the run outlives the request that started it.
  void run(queue.slice(0, limit));
  return batchStatus();
}
