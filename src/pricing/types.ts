import type { BagConfiguration } from '../domain/types';

// Placeholder contract for the future Pricing Engine (out of MVP scope).
// It consumes the domain configuration only — never renderer or UI state.
export type PriceQuote = {
  currency: string;
  unitPrice: number;
  quantity: number;
  total: number;
};

export interface PricingEngine {
  quote(configuration: BagConfiguration, quantity: number): PriceQuote;
}
