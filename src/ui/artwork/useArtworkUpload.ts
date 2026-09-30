import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ARTWORK_RULES } from '../../domain/config/productCatalog';
import { createArtwork } from '../../domain/factories';
import type { Artwork } from '../../domain/types';
import { validateArtworkFile, validateDecodedImage, type ArtworkError } from '../../domain/validation/artwork';
import { loadImageFile } from './loadImageFile';

/** Max upload size in MB, for messages. */
export const ARTWORK_MAX_MB = Math.round(ARTWORK_RULES.maxSizeBytes / (1024 * 1024));

/**
 * Upload flow shared by the wall uploaders and the whole-bag layer list: file validation (`validateArtworkFile`),
 * decoding (`loadImageFile`, `validateDecodedImage`), the hidden file input, drag & drop and keyboard handlers. A
 * valid file becomes an `Artwork` (owning a fresh object URL) handed to `onAccepted`; the latest request wins — an
 * older result (or one arriving after unmount) is discarded and its URL revoked.
 */
export function useArtworkUpload(onAccepted: (artwork: Artwork) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Incremented per upload; a result from an older request (or after unmount) is discarded.
  const requestRef = useRef(0);
  const acceptedRef = useRef(onAccepted);
  const [error, setError] = useState<ArtworkError | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    acceptedRef.current = onAccepted;
  });
  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  const accept = async (file: File | undefined) => {
    if (!file) return;
    const request = ++requestRef.current;
    const fileError = validateArtworkFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const image = await loadImageFile(file);
      if (request !== requestRef.current) {
        URL.revokeObjectURL(image.url);
        return;
      }
      const decodeError = validateDecodedImage(image);
      if (decodeError) {
        URL.revokeObjectURL(image.url);
        setError(decodeError);
        return;
      }
      acceptedRef.current(
        createArtwork({
          fileName: file.name,
          fileUrl: image.url,
          mimeType: file.type,
          width: image.width,
          height: image.height,
          sizeBytes: file.size,
        }),
      );
    } catch {
      if (request === requestRef.current) setError('DECODE_FAILED');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const openPicker = () => inputRef.current?.click();

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void accept(e.dataTransfer.files[0]);
    },
  };

  /** Enter / Space on a drop zone opens the file picker. */
  const zoneKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  /** Props of the hidden `<input type="file">` (add `accept` and an `aria-label`). */
  const inputProps = {
    ref: inputRef,
    type: 'file' as const,
    hidden: true,
    onChange: (e: { target: HTMLInputElement }) => {
      void accept(e.target.files?.[0]);
      e.target.value = '';
    },
  };

  return { accept, openPicker, dropHandlers, zoneKeyDown, inputProps, error, setError, loading, dragging };
}
