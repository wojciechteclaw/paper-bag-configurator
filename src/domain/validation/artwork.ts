import { ARTWORK_RULES, type ArtworkRules } from '../config/productCatalog';

export type ArtworkError = 'UNSUPPORTED_TYPE' | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'DECODE_FAILED';

/** Checks what is known before decoding: MIME type and size. */
export function validateArtworkFile(
  file: { type: string; size: number },
  rules: ArtworkRules = ARTWORK_RULES,
): ArtworkError | null {
  if (!rules.acceptedMimeTypes.includes(file.type)) return 'UNSUPPORTED_TYPE';
  if (file.size <= 0) return 'EMPTY_FILE';
  if (file.size > rules.maxSizeBytes) return 'FILE_TOO_LARGE';
  return null;
}

/** Checks the decoded pixel size: an image that decodes to 0×0 cannot be used as a texture. */
export function validateDecodedImage(size: { width: number; height: number }): ArtworkError | null {
  const ok = [size.width, size.height].every((v) => Number.isFinite(v) && v > 0);
  return ok ? null : 'DECODE_FAILED';
}
