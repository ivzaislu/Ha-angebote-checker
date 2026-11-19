import { createHash } from "node:crypto";
import { productKey, safePrice, validProductName } from "./product-knowledge.ts";
import { recognizeVariant } from "./product-variants.ts";
import { inferUnitPrice } from "./unit-price.ts";
import { EXACT_QUERIES, hardReject, offerFits } from "./exact.ts";

export type ArchiveOffer = {
  id?: string | number;
  name?: string | null;
  product?: { name?: string | null };
  description?: string | null;
  categories?: { name?: string | null }[];
  advertisers?: { name?: string }[];
  retailerName?: string;
  price?: number | string | null;
  validityDates?: { from?: string; to?: string }[];
  validFrom?: string;
  validTo?: string;
};
export interface ArchiveSql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function archiveRecord(country: "de" | "at", zip: string, raw: ArchiveOffer) {
  const name = (raw.product?.name || raw.name || "").trim();
  if (!validProductName(name) || raw.id == null || String(raw.id).trim() === "") return null;
  const description = raw.description ?? "";
  const price = safePrice(raw.price);
  const variant = recognizeVariant(name, description);
  const unitPrice = inferUnitPrice(`${name} ${description}`, price);
  const record = {
    country, offerId: String(raw.id), zip,
    retailer: raw.advertisers?.[0]?.name || raw.retailerName || "",
    name, nameKey: productKey(name), description,
    category: raw.categories?.[0]?.name ?? "",
    variantKey: JSON.stringify(variant), price,
    unit: unitPrice?.unit ?? null, quantity: unitPrice?.quantity ?? null,
    perUnit: unitPrice?.perUnit ?? null,
    validFrom: raw.validityDates?.[0]?.from || raw.validFrom || "",
    validTo: raw.validityDates?.[0]?.to || raw.validTo || "",
  };
  return { ...record, snapshotId: hash(JSON.stringify(record)), raw };
}

export async function archiveOffers(sql: ArchiveSql, country: "de" | "at", zip: string, offers: ArchiveOffer[]) {
  if (!(country === "de" ? /^\d{5}$/ : /^\d{4}$/).test(zip)) throw new Error("Invalid archive postcode");
  let inserted = 0;
  for (const offer of offers) {
    const r = archiveRecord(country, zip, offer);
    if (!r) continue;
    const rows = await sql.query(
      `insert into offer_archive(snapshot_id,country,offer_id,zip,retailer,name,name_key,description,
        category,variant_key,price,unit,quantity,unit_price,valid_from,valid_to,raw_payload)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
       on conflict(snapshot_id) do nothing returning snapshot_id`,
      [r.snapshotId,r.country,r.offerId,r.zip,r.retailer,r.name,r.nameKey,r.description,r.category,
        r.variantKey,r.price,r.unit,r.quantity,r.perUnit,r.validFrom,r.validTo,JSON.stringify(r.raw)],
    );
    inserted += rows.length;
  }
  return inserted;
}

export type PriceHistoryRow = {
  snapshot_id: string; name: string; description: string; retailer: string; zip: string; price: string;
  unit: string | null; quantity: string | null; unit_price: string | null;
  variant_key: string; valid_from: string; valid_to: string; observed_at: Date | string;
};

/** Exact normalized name; each row retains variant/quantity so unlike packs are visible. */
export async function priceHistory(sql: ArchiveSql, country: "de" | "at", name: string, zip?: string) {
  const rows = await sql.query<PriceHistoryRow>(
    `select snapshot_id,name,description,retailer,zip,price,unit,quantity,unit_price,variant_key,valid_from,valid_to,observed_at
     from offer_archive where country=$1 and name_key=$2 and price is not null
     and ($3::text is null or zip=$3)
     order by price asc, observed_at asc, snapshot_id asc limit 500`, [country,productKey(name),zip ?? null]);
  // Full range is independent of the bounded detail page.
  const [range] = await sql.query<{ minimum: string | null; maximum: string | null; observations: number }>(
    `select min(price) as minimum,max(price) as maximum,count(*)::int as observations
     from offer_archive where country=$1 and name_key=$2 and price is not null
     and ($3::text is null or zip=$3)`, [country,productKey(name),zip ?? null]);
  return { ...range, rows, truncated: range.observations > rows.length };
}

export type TrainingSource = {
  snapshot_id: string; country: string; offer_id: string; name: string;
  description: string; category: string; variant_key: string;
};

/** Weak labels are candidates for review, never claimed to be human ground truth. */
export function prepareTrainingData(rows: TrainingSource[]) {
  const seen = new Set<string>();
  return rows.flatMap(row => {
    const group = productKey(row.name);
    // Keep every occurrence of a product in the same split, including across regions.
    const split = parseInt(hash(group).slice(0,8),16) % 10 === 0 ? "validation" : "train";
    return EXACT_QUERIES.flatMap(rule => {
      const positive = offerFits(rule.query,row.name,row.description,row.category);
      const negative = hardReject(rule.query,row.name,row.description,row.category);
      if (positive === negative) return [];
      const id = hash(JSON.stringify([rule.query,group,productKey(row.description),row.category]));
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, schemaVersion: 1, intent: rule.query, name: row.name, description: row.description,
        category: row.category, positive, variant: JSON.parse(row.variant_key), split,
        labelSource: "rules-v1", needsReview: true,
        provenance: { source: "marktguru", country: row.country, offerId: row.offer_id, snapshotId: row.snapshot_id } }];
    });
  });
}
