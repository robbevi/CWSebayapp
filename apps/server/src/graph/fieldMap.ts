// itemCondition/transferId/ebayListingId weren't part of the original legacy CSV/list
// schema — these display names are best-effort guesses. If/when the SharePoint backend
// is re-enabled, verify these columns actually exist on the list (or add them) before
// relying on this mapping.
export const DISPLAY = {
  sku: 'SKU',
  description: 'Part Description',
  manufacturer: 'Manufacturer Name',
  inventorySite: 'Inventory Site',
  binLocation: 'Bin Location',
  qoh: 'Quantity On Hand',
  confirmedQoh: 'Confirmed Quantity On Hand',
  itemCondition: 'Item Condition',
  boxCondition: 'Box Condition',
  disposition: 'Disposition',
  dispositionNote: 'Disposition Notes',
  notes: 'Notes',
  photographed: 'Item Photographed',
  itemListed: 'Item Listed',
  itemListedDate: 'Item Listed Date',
  ebayListingId: 'eBay Listing ID',
  transferredToMarketRecovery: 'Transferred To Market Recovery',
  transferId: 'Transfer ID',
  catalogingStartDate: 'Cataloging Start Date',
  legacyPartId: 'Inventory Part ID',
  importSequenceNumber: 'Import Sequence Number',
} as const;

export type FieldKey = keyof typeof DISPLAY;
