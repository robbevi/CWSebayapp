export function buildPhotoFileName(sku: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const safeSku = sku.replace(/[^A-Za-z0-9-]/g, '-');
  return `${safeSku}_${date}_${time}.jpg`;
}

export function extractSkuFromFileName(name: string): string | null {
  const match = name.match(/^([^_]+)_/);
  return match ? match[1].toUpperCase() : null;
}
