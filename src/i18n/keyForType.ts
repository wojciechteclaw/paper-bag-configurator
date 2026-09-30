import type { BagType } from '../domain/types';

/**
 * i18n key of a text that some bag types word differently: `<base>ByType.<type>` for those types, `<base>` otherwise.
 * The gusseted-bag bag (FOLDED) writes its size as "W + F × H" (client notation [K], e.g. "140 + 90 × 370 mm").
 */
export function keyForType(base: string, productType: BagType): string {
  return productType === 'FOLDED' ? `${base}ByType.${productType}` : base;
}
