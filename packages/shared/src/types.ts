export type ConditionEnum = 'New' | 'Like New' | 'Good' | 'Fair' | 'Poor' | 'For Parts';

export type BoxConditionEnum = 'Excellent' | 'Very Good' | 'Good' | 'Poor' | 'No Box';

export type WorkflowStatus = 'NotStarted' | 'Processing' | 'Completed';

export interface Photo {
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
  photographed: boolean;
  itemListed: boolean;
  itemListedDate?: string | null;
  ebayListingId?: string | null;
  transferredToMarketRecovery: boolean;
  transferId?: string | null;
  catalogingStartDate?: string | null;
  legacyPartId?: string;
  importSequenceNumber?: number | null;
  photos: Photo[];
  updatedAt?: string;
  workflowStatus: WorkflowStatus;
}

export type InventoryPartPatch = Partial<
  Pick<
    InventoryPart,
    | 'confirmedQoh'
    | 'notes'
    | 'itemCondition'
    | 'boxCondition'
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
