/** Only infer unit prices when the package quantity is unambiguous. */
export type UnitPrice = { unit: "kg" | "l"; quantity: number; perUnit: number };
export function inferUnitPrice(text: string, price: number | null): UnitPrice | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  // Reject ambiguous ranges and mixed quantities rather than reporting misleading bargains.
  if (/\d+(?:[,.]\d+)?\s*[-–]\s*\d+(?:[,.]\d+)?\s*(?:g|kg|ml|l)\b/.test(normalized)) return null;
  const pattern = /\b(?:(\d+)\s*[x×]\s*)?(\d+(?:[,.]\d+)?)\s*(kg|g|ml|l)\b/g;
  const matches = [...normalized.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const [, multiplierRaw, quantityRaw, unitRaw] = matches[0];
  const multiplier = multiplierRaw ? Number(multiplierRaw) : 1;
  const quantity = Number(quantityRaw.replace(",", ".")) * multiplier;
  const base = unitRaw === "g" || unitRaw === "ml" ? quantity / 1000 : quantity;
  if (base <= 0 || !Number.isFinite(base) || base > 1000) return null;
  return { unit: unitRaw === "kg" || unitRaw === "g" ? "kg" : "l", quantity: base, perUnit: Math.round(price / base * 100) / 100 };
}
