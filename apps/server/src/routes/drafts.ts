import { Router } from 'express';
import { composeDraft, draftReadiness, groupPartsBySku } from '@warehouse/shared';
import { env, isGoogleConfigured } from '../config/env.js';
import { createItemDraft } from '../ebay/draftService.js';
import { isEbayConfigured } from '../ebay/ordersService.js';
import { getAllParts, updatePart } from '../google/sheetsService.js';

export const draftsRouter = Router();

/**
 * Creates an eBay draft for one part.
 *
 * A draft is not a listing: it lands in the seller's eBay drafts and still has to be
 * published there by a person. Nothing this endpoint does can put stock on sale.
 */
draftsRouter.post('/parts/:id/draft', async (req, res, next) => {
  try {
    if (!isEbayConfigured()) {
      res.status(503).json({ error: 'eBay is not connected.' });
      return;
    }
    if (!isGoogleConfigured()) {
      res.status(503).json({ error: 'No data backend is configured for this environment.' });
      return;
    }

    // eBay fetches the photographs itself, so it needs an address reachable from outside.
    const publicBase = env.publicBaseUrl;
    if (!publicBase) {
      res.status(503).json({
        error:
          'PUBLIC_BASE_URL is not set. eBay fetches photographs over the internet, so it needs the app\'s public address.',
      });
      return;
    }

    const parts = await getAllParts();
    const group = groupPartsBySku(parts).find((g) => g.records.some((r) => r.id === req.params.id));
    if (!group) {
      res.status(404).json({ error: 'Part not found.' });
      return;
    }

    const existing = group.records.find((r) => r.ebayDraftId);
    if (existing) {
      res.status(409).json({
        error: 'This part already has a draft on eBay.',
        draftId: existing.ebayDraftId,
        url: existing.ebayDraftUrl,
      });
      return;
    }

    const readiness = draftReadiness(group);
    if (!readiness.ready) {
      res.status(422).json({ error: `Not ready to draft: ${readiness.blockers.join(', ')}.` });
      return;
    }

    const draft = composeDraft(group, publicBase)!;
    const result = await createItemDraft(draft);

    // Recorded against the row that owns the work, so the button does not offer twice.
    await updatePart(group.primary.id, {
      ebayDraftId: result.itemDraftId,
      ebayDraftUrl: result.url,
    });

    res.json({
      draftId: result.itemDraftId,
      url: result.url,
      title: draft.title,
      priceMissing: draft.price == null,
    });
  } catch (err) {
    next(err);
  }
});

/** What the draft would say, so it can be checked before anything is created. */
draftsRouter.get('/parts/:id/draft/preview', async (req, res, next) => {
  try {
    const parts = await getAllParts();
    const group = groupPartsBySku(parts).find((g) => g.records.some((r) => r.id === req.params.id));
    if (!group) {
      res.status(404).json({ error: 'Part not found.' });
      return;
    }
    const readiness = draftReadiness(group);
    res.json({
      readiness,
      draft: readiness.ready ? composeDraft(group, env.publicBaseUrl ?? '') : null,
    });
  } catch (err) {
    next(err);
  }
});
