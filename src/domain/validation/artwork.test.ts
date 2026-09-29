import { describe, expect, it } from 'vitest';
import { ARTWORK_RULES } from '../config/productCatalog';
import { validateArtworkFile, validateDecodedImage } from './artwork';

describe('validateArtworkFile', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(validateArtworkFile({ type, size: 1024 })).toBeNull();
  });

  it.each(['application/pdf', 'image/svg+xml', 'image/tiff', ''])('rejects %s', (type) => {
    expect(validateArtworkFile({ type, size: 1024 })).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects empty files', () => {
    expect(validateArtworkFile({ type: 'image/png', size: 0 })).toBe('EMPTY_FILE');
  });

  it('accepts exactly the maximum size and rejects one byte more', () => {
    expect(validateArtworkFile({ type: 'image/png', size: ARTWORK_RULES.maxSizeBytes })).toBeNull();
    expect(validateArtworkFile({ type: 'image/png', size: ARTWORK_RULES.maxSizeBytes + 1 })).toBe('FILE_TOO_LARGE');
  });
});

describe('validateDecodedImage', () => {
  it('accepts a positive pixel size', () => {
    expect(validateDecodedImage({ width: 800, height: 600 })).toBeNull();
  });

  it.each([
    [0, 600],
    [800, 0],
    [Number.NaN, 600],
  ])('rejects %s × %s', (width, height) => {
    expect(validateDecodedImage({ width, height })).toBe('DECODE_FAILED');
  });
});
