function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9-]/g, '-');
}

// The site is part of the label so a Drive folder of loose photos is still readable now
// that the same SKU can be stocked at several sites. It is only a label: association is
// carried by the file's `partId` property, which survives renames and site changes.
export function buildPhotoFileName(sku: string, site?: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const parts = [sanitizeSegment(sku)];
  if (site) parts.push(sanitizeSegment(site));
  return `${parts.join('_')}_${date}_${time}.jpg`;
}

export function extractSkuFromFileName(name: string): string | null {
  const match = name.match(/^([^_]+)_/);
  return match ? match[1].toUpperCase() : null;
}
