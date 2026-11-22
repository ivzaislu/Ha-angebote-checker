import { offerFits } from "./exact.ts";
import { compatibleSalmon } from "./product-variants.ts";

export const PRODUCT_RULESET_VERSION = 3;

export type ProductText = {intent: string; name: string; description: string; category: string};
/** Deterministic matching shared by archived and remote offers. */
export function matchesProduct(row: ProductText): boolean {
  return offerFits(row.intent, row.name, row.description, row.category) && compatibleSalmon(row.intent, row.name);
}
/** Old/unidentified results need a fresh archive-first check. */
export function scanMatchesMode(saved: {matchingMode?: string; rulesVersion?:number} | null) {
  return saved?.matchingMode === "rules" && saved.rulesVersion === PRODUCT_RULESET_VERSION;
}
