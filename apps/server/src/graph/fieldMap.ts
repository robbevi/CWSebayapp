export const DISPLAY = {
  sku: 'SKU',
  description: 'Part Description',
  manufacturer: 'Manufacturer Name',
  inventorySite: 'Inventory Site',
  binLocation: 'Bin Location',
  qoh: 'Quantity On Hand',
  confirmedQoh: 'Confirmed Quantity On Hand',
  boxCondition: 'Box Condition',
  notes: 'Notes',
  photographed: 'Item Photographed',
  itemListed: 'Item Listed',
  itemListedDate: 'Item Listed Date',
  transferredToMarketRecovery: 'Transferred To Market Recovery',
  catalogingStartDate: 'Cataloging Start Date',
  legacyPartId: 'Inventory Part ID',
  importSequenceNumber: 'Import Sequence Number',
} as const;

export type FieldKey = keyof typeof DISPLAY;
