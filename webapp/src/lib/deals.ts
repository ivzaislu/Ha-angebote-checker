export type Deal = {
  id: string;
  item: string;
  productName: string;
  description: string;
  retailer: string;
  priceLabel: string;
  priceValue: number | null;
  unitPrice?: { unit: "kg" | "l"; quantity: number; perUnit: number } | null;
  validFrom: string;
  validTo: string;
  imageUrl: string;
  relevance: number;
  onlineOnly: boolean;
  category: string;
  fromBrain?: boolean;
};

export type ItemScan = {
  item: string;
  deals: Deal[];
  error: string | null;
};

const WORD_SPLIT = /\W+/u;

/** Same ranking as Angebote Checker, plus a phrase boost for multi-word lists. */
export function relevanceScore(
  query: string,
  productName: string,
  description: string,
): number {
  const needle = query.toLowerCase().trim();
  if (!needle) return 0;

  const product = productName.toLowerCase();
  if (product) {
    const words = product.split(WORD_SPLIT).filter(Boolean);
    const first = words[0] ?? "";
    if (product === needle) return 100;
    if (first === needle) return 90;
    if (words.includes(needle)) return 80;
    const tokens = needle.split(WORD_SPLIT).filter((w) => w.length > 2);
    if (tokens.length > 1 && tokens.every((t) => words.includes(t))) return 85;
    if (product.startsWith(needle)) return 50;
    if (product.includes(needle)) return 30;
    if (tokens.length > 1 && tokens.every((t) => product.includes(t))) return 40;
  }

  const detail = description.toLowerCase();
  if (detail) {
    const words = detail.split(WORD_SPLIT).filter(Boolean);
    if (words.includes(needle)) return 25;
    if (detail.includes(needle)) return 10;
  }
  return 0;
}

export function primaryDeals(deals: Deal[]): { shown: Deal[]; rest: Deal[] } {
  if (deals.length === 0) return { shown: [], rest: [] };
  const top = Math.max(...deals.map((deal) => deal.relevance));
  const floor = top >= 90 ? 90 : top;
  const shown = deals.filter((deal) => deal.relevance >= floor);
  const rest = deals.filter((deal) => deal.relevance < floor);
  if (shown.length === 0) return { shown: deals.slice(0, 3), rest: deals.slice(3) };
  return { shown, rest };
}

export function cheapestId(deals: Deal[]): string | null {
  const priced = deals.filter((deal) => deal.priceValue != null && !deal.onlineOnly);
  if (priced.length < 2) return null;
  let best = priced[0];
  for (const deal of priced) {
    if ((deal.priceValue ?? Infinity) < (best.priceValue ?? Infinity)) best = deal;
  }
  return best.id;
}
