import type { ArchiveOffer, ArchiveSql } from "./offer-archive.ts";
import { productKey, safePrice } from "./product-knowledge.ts";
import { exactQueryFor } from "./exact.ts";
import { matchesProduct } from "./product-matching.ts";

/** Compare calendar days in the offer's market, including the whole last day. */
function marketDay(country: "de" | "at", now: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: country === "de" ? "Europe/Berlin" : "Europe/Vienna",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  return ["year","month","day"].map(type=>parts.find(part=>part.type===type)!.value).join("-");
}
function dateDay(value: string | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === day ? day : null;
}

/** Missing expiry is trusted for at most 24 hours; malformed dates are not current. */
export function currentArchivedOffer(raw: ArchiveOffer, observedAt: Date | string, country: "de" | "at", now = new Date()): ArchiveOffer | null {
  const today = marketDay(country,now);
  const windows = raw.validityDates?.length ? raw.validityDates : [{from:raw.validFrom,to:raw.validTo}];
  for (const window of windows) {
    const from = dateDay(window.from);
    const to = dateDay(window.to);
    if ((window.from && !from) || (window.to && !to)) continue;
    if ((from && from > today) || (to && to < today)) continue;
    if (!to) {
      const age = now.getTime() - new Date(observedAt).getTime();
      if (!Number.isFinite(age) || age < 0 || age > 24*60*60*1000) continue;
    }
    return {...raw,validityDates:[window]};
  }
  return null;
}

export type SavedOfferQuery = { country: "de" | "at"; zip: string; query: string; retailers: string[] };

export async function savedOffers(sql: ArchiveSql, input: SavedOfferQuery, now = new Date()): Promise<ArchiveOffer[]> {
  const rule = exactQueryFor(input.query);
  const terms = [input.query, rule?.query ?? "", ...(rule?.aliases ?? []), ...(rule?.acceptCategories ?? [])].filter(Boolean);
  const patterns = [...new Set(terms.flatMap(term=>[productKey(term),term.toLocaleLowerCase("de")]))]
    .filter(Boolean).map(term=>`%${term.replace(/[\\%_]/g,"\\$&")}%`);
  // Select the newest state BEFORE matching names/validity: an older state must
  // never reappear when the latest state has changed its product or expired.
  const rows = await sql.query<{raw_payload: ArchiveOffer; offer_id: string; observed_at: Date | string}>(
    `with latest as (
       select distinct on (offer_id,retailer) offer_id,raw_payload,observed_at,name_key,description,category
       from offer_archive where country=$1 and zip=$2
       order by offer_id,retailer,observed_at desc,snapshot_id desc
     ) select raw_payload,offer_id,observed_at from latest
       where name_key like any($3::text[]) or lower(description) like any($3::text[]) or lower(category) like any($3::text[])`,
    [input.country,input.zip,patterns],
  );
  return rows.flatMap(row=>{
    const raw = currentArchivedOffer({...row.raw_payload,id:row.raw_payload.id ?? row.offer_id},row.observed_at,input.country,now);
    if (!raw) return [];
    const name = raw.product?.name || raw.name || "";
    const retailer = raw.advertisers?.[0]?.name || raw.retailerName || "";
    if (input.retailers.length && !input.retailers.some(value=>retailer.toLocaleLowerCase("de").includes(value.toLocaleLowerCase("de")))) return [];
    if (!matchesProduct({intent:input.query,name,description:raw.description ?? "",category:raw.categories?.[0]?.name ?? ""})) return [];
    const price = safePrice(raw.price);
    return price === null ? [] : [{...raw,price}];
  });
}
