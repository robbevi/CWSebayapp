import { useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import type { Photo } from '@warehouse/shared';
import { downscaleToFile } from '../lib/image';
import { useUploadPhoto } from '../hooks/useUploadPhoto';
import { Pill } from './ui/Pill';

interface PhotoUploaderProps {
  sku: string;
  itemId: string;
  photos: Photo[];
}

interface FailedUpload {
  id: string;
  file: File;
  error: string;
}

function makeFileList(file: File): FileList {
  const dt = new DataTransfer();
  dt.items.add(file);
  return dt.files;
}

export function PhotoUploader({ sku, itemId, photos }: PhotoUploaderProps) {
  const takeInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [activePreview, setActivePreview] = useState(0);
  const [failed, setFailed] = useState<FailedUpload[]>([]);
  const uploadPhoto = useUploadPhoto();

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const downscaled = await downscaleToFile(file);
        await uploadPhoto.mutateAsync({ sku, itemId, file: downscaled });
      } catch (err) {
        setFailed((f) => [
          ...f,
          { id: `${file.name}-${Date.now()}`, file, error: err instanceof Error ? err.message : 'Upload failed' },
        ]);
      }
    }
  };

  const retry = async (item: FailedUpload) => {
    setFailed((f) => f.filter((x) => x.id !== item.id));
    await handleFiles(makeFileList(item.file));
  };

  const activePhoto = photos[Math.min(activePreview, photos.length - 1)];

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          ref={takeInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => takeInputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover"
        >
          <Camera size={16} /> Take Photo
        </button>
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-border px-4 py-2 text-sm font-medium text-textPri hover:bg-surfaceMuted"
        >
          <Upload size={16} /> Upload Photos
        </button>
      </div>

      <div className="rounded-card border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-textMuted">Photo preview</span>
          <Pill>{photos.length} saved</Pill>
        </div>

        {photos.length > 0 && activePhoto ? (
          <>
            <img src={activePhoto.url} alt={`${sku} preview`} className="mb-2 h-56 w-full rounded-btn object-cover" />
            <div className="flex gap-2 overflow-x-auto">
              {photos.map((p, i) => (
                <button
                  key={p.fileName}
                  type="button"
                  onClick={() => setActivePreview(i)}
                  className="shrink-0"
                  title={`Photo ${i + 1}`}
                >
                  <img src={p.url} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-btn object-cover" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-textMuted">No photos yet</div>
        )}

        {failed.map((f) => (
          <div
            key={f.id}
            className="mt-2 flex items-center justify-between rounded-btn bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <span className="flex items-center gap-1.5">
              <X size={12} /> {f.file.name}: {f.error}
            </span>
            <button type="button" onClick={() => retry(f)} className="font-semibold underline">
              Retry
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
