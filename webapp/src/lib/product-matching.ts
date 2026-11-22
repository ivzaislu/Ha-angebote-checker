import type { ProductModelPackage } from "./product-model-store.ts";
export type ProductMatchingMode = "rules" | "neural";
/** Missing, misspelled and unknown settings all keep the deterministic default. */
export function productMatchingMode(value?: string): ProductMatchingMode {
  return value === "neural" ? "neural" : "rules";
}
/** Rules search must not read model weights or the active-model pointer. */
export async function searchProductModel(
  load: () => Promise<ProductModelPackage | null>, value?: string,
): Promise<ProductModelPackage | null> {
  return productMatchingMode(value) === "neural" ? load() : null;
}
export function scanMatchesMode(saved: { matchingMode?: ProductMatchingMode } | null, mode?: ProductMatchingMode) {
  return Boolean(saved && mode && saved.matchingMode === mode);
}
