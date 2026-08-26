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

/**
 * Where a part sits on the board. The third state is "on eBay" rather than "every
 * checkpoint ticked": most listings go up before their condition or transfer is logged,
 * so keying the column on checkpoints left 35 of 40 live listings sitting in Processing.
 * Whether the five checkpoints are done is still tracked, and still shown on the card.
 */
export type WorkflowStatus = 'NotStarted' | 'Processing' | 'Listed';

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
  /**
   * The record this photo was taken against. A SKU can span several rows, and the row that
   * owns a photo is not necessarily the one whose card you opened.
   */
  partId?: string;
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
  /** Shelf the part is moved to at the Iron Barn once it leaves the Williston warehouse. */
  newBinLocation?: string;
  qoh: number;
  confirmedQoh: number | null;
  notes?: string;
  itemCondition?: ConditionEnum | string;
  boxCondition?: BoxConditionEnum | string;
  disposition?: DispositionEnum | string;
  dispositionNote?: string;
  photographed: boolean;
  /** Flagged by a user as something that needs a second look before it moves on. */
  needsReview?: boolean;
  needsReviewNote?: string;
  itemListed: boolean;
  itemListedDate?: string | null;
  ebayListingId?: string | null;
  transferredToMarketRecovery: boolean;
  transferId?: string | null;
  catalogingStartDate?: string | null;
  legacyPartId?: string;
  importSequenceNumber?: number | null;
  /** Set when the row is created in the app. Absent on everything imported before it. */
  createdAt?: string;
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

// SKU is deliberately absent: photos are located in Drive by a `sku` file property, so
// renaming one here would silently orphan its pictures. Everything else in the Part Detail
// header is editable.
export type InventoryPartPatch = Partial<
  Pick<
    InventoryPart,
    | 'description'
    | 'manufacturer'
    | 'inventorySite'
    | 'binLocation'
    | 'qoh'
    | 'needsReview'
    | 'needsReviewNote'
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
    | 'newBinLocation'
  >
>;

export interface HealthStatus {
  backend: 'google' | 'sharepoint' | 'none';
  configured: boolean;
  resolved: boolean;
  error?: string;
}
