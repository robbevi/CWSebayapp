export type ConditionEnum = 'New' | 'Like New' | 'Good' | 'Fair' | 'Poor' | 'For Parts';

export type BoxConditionEnum = 'Excellent' | 'Very Good' | 'Good' | 'Poor' | 'No Box';

export type DispositionEnum =
  | 'Unable to Locate'
  | 'Location Discrepancy'
  | 'Currently Active Unit'
  | 'Reserved for Operations'
  | 'Committed to Work Order'
  | 'Damaged'
  | 'Excessive Wear'
  | 'Non-Functional'
  | 'Missing Components'
  | 'Low Resale Value'
  | 'No Market Demand'
  | 'Scrap'
  | 'Recycle'
  | 'Other';

export type WorkflowStatus = 'NotStarted' | 'Processing' | 'Completed';

export type GrossMarginStatus = 'Positive Gross Margin' | 'Negative Gross Margin';

// The source data labels these "1 - Highest Priority" … "4 - Low Dollar Review". Anything
// in tier 1 or 2 is surfaced as high priority on the card.
export function isHighPriority(fieldReviewPriority: string | undefined | null): boolean {
  if (!fieldReviewPriority) return false;
  return /^\s*[12]\b/.test(fieldReviewPriority);
}

export function isPositiveMargin(grossMarginStatus: string | undefined | null): boolean {
  return grossMarginStatus === 'Positive Gross Margin';
}

export interface Photo {
  fileId: string;
  fileName: string;
  url: string;
  uploadedAt: string;
}

export interface InventoryPart {
  id: string;
  sku: string;
  description: string;
  manufacturer: string;
  inventorySite: string;
  binLocation: string;
  qoh: number;
  confirmedQoh: number | null;
  notes?: string;
  itemCondition?: ConditionEnum | string;
  boxCondition?: BoxConditionEnum | string;
  disposition?: DispositionEnum | string;
  dispositionNote?: string;
  photographed: boolean;
  itemListed: boolean;
  itemListedDate?: string | null;
  ebayListingId?: string | null;
  transferredToMarketRecovery: boolean;
  transferId?: string | null;
  catalogingStartDate?: string | null;
  legacyPartId?: string;
  importSequenceNumber?: number | null;
  // Recovery/revenue analytics, supplied by the source spreadsheet rather than entered in
  // the app. Optional throughout: parts loaded before these columns existed have none.
  revenuePriorityRank?: number | null;
  fieldReviewPriority?: string;
  activeRecoveryPriceBasis?: number | null;
  expectedGrossRecoveryMargin?: number | null;
  grossMarginStatus?: GrossMarginStatus | string;
  photos: Photo[];
  updatedAt?: string;
  workflowStatus: WorkflowStatus;
}

export interface CreatePartInput {
  sku: string;
  binLocation?: string;
  qoh?: number;
  manufacturer?: string;
  inventorySite?: string;
}

export type InventoryPartPatch = Partial<
  Pick<
    InventoryPart,
    | 'confirmedQoh'
    | 'notes'
    | 'itemCondition'
    | 'boxCondition'
    | 'disposition'
    | 'dispositionNote'
    | 'photographed'
    | 'itemListed'
    | 'itemListedDate'
    | 'ebayListingId'
    | 'transferredToMarketRecovery'
    | 'transferId'
    | 'catalogingStartDate'
  >
>;

export interface HealthStatus {
  backend: 'google' | 'sharepoint' | 'none';
  configured: boolean;
  resolved: boolean;
  error?: string;
}
