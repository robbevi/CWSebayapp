export type ConditionEnum = 'New' | 'LikeNew' | 'Good' | 'Fair' | 'Poor' | 'ForParts';

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
  boxCondition?: ConditionEnum | string;
  photographed: boolean;
  itemListed: boolean;
  itemListedDate?: string | null;
  transferredToMarketRecovery: boolean;
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
    | 'boxCondition'
    | 'photographed'
    | 'itemListed'
    | 'itemListedDate'
    | 'transferredToMarketRecovery'
    | 'catalogingStartDate'
  >
>;

export interface HealthStatus {
  backend: 'google' | 'sharepoint' | 'none';
  configured: boolean;
  resolved: boolean;
  error?: string;
}
