/** Pure helpers shared by the catalog writer and autocomplete. */
export function productKey(value: string): string {
  return value.toLocaleLowerCase("de")
    .replaceAll("ß", "ss")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
export function validProductName(value: string): boolean {
  const name = value.trim();
  return name.length >= 3 && name.length <= 180 && /[a-zA-ZäöüÄÖÜß]/.test(name);
}
export function safePrice(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}
export function rankSuggestions(names: { name: string; seen: number }[], prefix: string, limit = 8) {
  const needle = productKey(prefix);
  if (needle.length < 2) return [];
  return names.filter(x => productKey(x.name).includes(needle))
    .sort((a,b) => {
      const aStart = productKey(a.name).startsWith(needle) ? 1 : 0;
      const bStart = productKey(b.name).startsWith(needle) ? 1 : 0;
      return bStart - aStart || b.seen - a.seen || a.name.localeCompare(b.name, "de");
    }).slice(0,limit);
}
