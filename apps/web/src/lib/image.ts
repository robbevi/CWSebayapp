// Re-encoding through canvas — even at quality 1.0 — always recompresses, since
// browser JPEG encoders aren't the same as a phone camera's, so it's reserved for
// formats that need converting for cross-browser display (HEIC, PNG, WEBP, ...).
// No resizing is applied; this is a format-compatibility conversion, not a size reduction.
export async function convertToJpeg(file: File, quality = 0.97): Promise<File> {
  const img = await createImageBitmap(file);

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')!.drawImage(img, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))), 'image/jpeg', quality)
  );

  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

// Uploads should preserve the exact original quality captured on the device. If the
// file is already a JPEG (the common case for phone cameras), it's uploaded byte-for-byte
// unchanged — no resizing, no recompression. Only non-JPEG formats get converted, purely
// for display compatibility (e.g. HEIC isn't renderable in most browsers).
export async function prepareUpload(file: File): Promise<File> {
  const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
  return isJpeg ? file : convertToJpeg(file);
}
