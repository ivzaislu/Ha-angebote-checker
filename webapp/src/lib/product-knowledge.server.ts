import { getSql } from "@/lib/db";
import { productKey, rankSuggestions, safePrice, validProductName } from "@/lib/product-knowledge";
import type { CountryCode } from "@/lib/catalog";

export type ProductObservation = {
  name: string;
  category?: string;
  retailer?: string;
  offerId?: string | number;
  price?: number | string | null;
};

/** Deduplicate a response so repeated scans do not inflate product frequency. */
export async function rememberProducts(country: CountryCode, offers: ProductObservation[]): Promise<void> {
  const sql = await getSql();
  const unique = new Map<string, ProductObservation>();
  for (const offer of offers) {
    if (!validProductName(offer.name)) continue;
    const key = productKey(offer.name);
    if (!unique.has(key)) unique.set(key, offer);
  }
  for (const [key, offer] of unique) {
    await sql.query(
      `insert into known_products(country, name_key, name, category)
       values ($1,$2,$3,$4)
       on conflict(country,name_key) do update
       set name = excluded.name, category = case when excluded.category <> '' then excluded.category else known_products.category end,
           last_seen = now(), seen_count = known_products.seen_count + 1`,
      [country, key, offer.name.trim(), (offer.category ?? "").slice(0, 180)],
    );
  }
  for (const offer of offers) {
    const price = safePrice(offer.price);
    if (!validProductName(offer.name) || price === null || !offer.offerId || !offer.retailer) continue;
    await sql.query(
      `insert into observed_prices(country,offer_id,retailer,name_key,price)
       values($1,$2,$3,$4,$5)
       on conflict(country,offer_id,retailer) do update
       set price=excluded.price, observed_at=now()`,
      [country, String(offer.offerId), offer.retailer.slice(0, 180), productKey(offer.name), price],
    );
  }
}

export async function knownProductHints(country: CountryCode, prefix: string) {
  const needle = productKey(prefix);
  if (needle.length < 2 || needle.length > 100) return [];
  const sql = await getSql();
  // Escape SQL LIKE wildcards; parameterized search and bounded result set.
  const escaped = needle.replace(/[\\%_]/g, "\\$&");
  const rows = await sql.query<{ name: string; seen: number }>(
    `select name, seen_count as seen from known_products
     where country=$1 and name_key like $2 escape '\\'
     order by seen_count desc limit 100`,
    [country, `%${escaped}%`],
  );
  return rankSuggestions(rows, prefix, 8);
}
