import { COUNTRIES, type CountryCode } from "@/lib/catalog";
import { relevanceScore, type Deal } from "@/lib/deals";
import { offerFits } from "@/lib/exact";
import { learnLessons, rememberWeek, snapshotFor } from "@/lib/brain.server";
import { gatherLessons } from "@/lib/corpus.server";
import { rememberProducts } from "@/lib/product-knowledge.server";
import { inferUnitPrice } from "@/lib/unit-price";
import { archiveOffers } from "@/lib/offer-archive";
import { getSql } from "@/lib/db";
import { savedOffers } from "@/lib/offer-cache";
import { searchProductModel } from "./product-matching.ts";
import { currentProductModel } from "@/lib/product-model.server";
import { decideProduct } from "@/lib/product-policy";
import { compatibleSalmon } from "@/lib/product-variants";

const UA = "Mozilla/5.0";

type Keys = { apiKey: string; clientKey: string };

const CONFIG: Record<
  CountryCode,
  { api: string; site: string; image: string; keys: Keys | null }
> = {
  de: {
    api: "https://api.marktguru.de/api/v1/offers/search",
    site: "https://www.marktguru.de/",
    image:
      "https://cdn.marktguru.de/api/v1/offers/{offer_id}/images/default/0/medium.webp",
    keys: {
      apiKey: "8Kk+pmbf7TgJ9nVj2cXeA7P5zBGv8iuutVVMRfOfvNE=",
      clientKey: "WU/RH+PMGDi+gkZer3WbMelt6zcYHSTytNB7VpTia90=",
    },
  },
  at: {
    api: "https://api.marktguru.at/api/v1/offers/search",
    site: "https://www.marktguru.at/",
    image:
      "https://cdn.marktguru.at/api/v1/offers/{offer_id}/images/default/0/medium.webp",
    keys: null,
  },
};

const keyCache = new Map<CountryCode, Keys>();

type RawOffer = {
  id?: number | string;
  description?: string | null;
  price?: number | string | null;
  advertisers?: { name?: string }[];
  retailerName?: string;
  validityDates?: { from?: string; to?: string }[];
  validFrom?: string;
  validTo?: string;
  product?: { name?: string | null };
  name?: string | null;
  categories?: { name?: string | null }[];
};

function formatDate(value?: string | null): string {
  if (!value) return "";
  const day = value.slice(0, 10);
  const [year, month, date] = day.split("-");
  if (!year || !month || !date) return "";
  return `${date}.${month}.${year}`;
}

function formatPrice(raw: RawOffer["price"]): { label: string; value: number | null } {
  if (raw == null || raw === "") return { label: "—", value: null };
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return { label: String(raw), value: null };
  return { label: `${value.toFixed(2).replace(".", ",")} €`, value };
}

async function scrapeKeys(country: CountryCode): Promise<Keys> {
  const cached = keyCache.get(country);
  if (cached) return cached;
  const res = await fetch(CONFIG[country].site, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error("Marktguru ist nicht erreichbar");
  const html = await res.text();
  const apiKey = html.match(/"apiKey"\s*:\s*"([^"]+)"/)?.[1];
  const clientKey = html.match(/"clientKey"\s*:\s*"([^"]+)"/)?.[1];
  if (!apiKey || !clientKey) throw new Error("Marktguru-Schlüssel nicht gefunden");
  const keys = { apiKey, clientKey };
  keyCache.set(country, keys);
  return keys;
}

async function keysFor(country: CountryCode, forceScrape: boolean): Promise<Keys> {
  if (forceScrape) {
    keyCache.delete(country);
    return scrapeKeys(country);
  }
  const baked = CONFIG[country].keys;
  if (baked) return baked;
  return scrapeKeys(country);
}

function parseOffer(
  entry: RawOffer,
  query: string,
  retailers: string[],
  imageTemplate: string,
  decision: { keep: boolean; fromBrain: boolean } | null,
): Deal | null {
  const advertiser = entry.advertisers?.[0];
  const retailer = advertiser?.name || entry.retailerName || "Unbekannt";
  if (
    retailers.length > 0 &&
    !retailers.some((name) => retailer.toLowerCase().includes(name.toLowerCase()))
  ) {
    return null;
  }

  const productName = entry.product?.name || entry.name || "";
  const description = entry.description || "";
  const category = entry.categories?.[0]?.name ?? "";
  const keep = decision ? decision.keep : offerFits(query, productName, description, category);
  if (!keep || !compatibleSalmon(query, productName)) return null;
  const relevance = relevanceScore(query, productName, description);
  const { label, value } = formatPrice(entry.price);
  const dates = entry.validityDates?.[0];
  const offerId = entry.id;
  const blob = `${productName} ${description}`.toLowerCase();

  return {
    id: String(offerId ?? `${retailer}-${label}-${description}`),
    item: query,
    productName,
    description: description || productName,
    retailer,
    priceLabel: label,
    priceValue: value,
    unitPrice: inferUnitPrice(`${productName} ${description}`, value),
    validFrom: formatDate(dates?.from || entry.validFrom),
    validTo: formatDate(dates?.to || entry.validTo),
    imageUrl: offerId ? imageTemplate.replace("{offer_id}", String(offerId)) : "",
    relevance,
    onlineOnly: /nur online|online verfügbar/.test(blob),
    category,
    fromBrain: decision?.fromBrain ?? false,
  };
}

async function fetchRaw(
  country: CountryCode,
  zip: string,
  query: string,
  forceScrape: boolean,
): Promise<RawOffer[]> {
  const keys = await keysFor(country, forceScrape);
  const url = new URL(CONFIG[country].api);
  url.searchParams.set("as", "web");
  url.searchParams.set("limit", "20");
  url.searchParams.set("offset", "0");
  url.searchParams.set("q", query);
  url.searchParams.set("zipCode", zip);

  const res = await fetch(url, {
    headers: {
      "x-apikey": keys.apiKey,
      "x-clientkey": keys.clientKey,
      accept: "application/json",
      "user-agent": UA,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if ((res.status === 401 || res.status === 403) && !forceScrape) {
    return fetchRaw(country, zip, query, true);
  }
  if (!res.ok) throw new Error(`Marktguru meldet Status ${res.status}`);
  const data = (await res.json()) as { results?: RawOffer[] };
  return data.results ?? [];
}

export async function searchDeals(input: {
  country: CountryCode;
  zip: string;
  query: string;
  retailers: string[];
}): Promise<Deal[]> {
  const allowed = new Set(COUNTRIES[input.country].retailers);
  const retailers = input.retailers.filter((name) => allowed.has(name));
  const model = await searchProductModel(currentProductModel, process.env.PRODUCT_MATCHING_MODE).catch(error=>{console.error("product model",error);return null;});
  const classify = (entry:RawOffer) => decideProduct(model,{
    intent:input.query,name:entry.product?.name || entry.name || "",
    description:entry.description || "",category:entry.categories?.[0]?.name || "",
  });
  const saved = await savedOffers(await getSql(), {...input,retailers},new Date(),entry=>classify(entry).keep);
  const cachedDeals = saved.flatMap(entry=>{
    const deal = parseOffer(entry,input.query,retailers,CONFIG[input.country].image,classify(entry));
    return deal ? [{...deal,fromArchive:true}] : [];
  });
  if (cachedDeals.length) {
    return cachedDeals.sort((a,b)=>b.relevance-a.relevance || (a.priceValue ?? 1e9)-(b.priceValue ?? 1e9));
  }
  // A missing local match needs only this query, never a full leaflet crawl.
  const raw = await fetchRaw(input.country, input.zip, input.query, false);
  await archiveOffers(await getSql(), input.country, input.zip, raw);
  await rememberProducts(input.country, raw.map((entry) => ({
    name: entry.product?.name || entry.name || "",
    category: entry.categories?.[0]?.name ?? "",
    retailer: entry.advertisers?.[0]?.name || entry.retailerName || "",
    offerId: entry.id,
    price: entry.price,
  }))).catch((err) => console.error("product catalog", err));
  const seen = new Set<string>();
  const deals: Deal[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const deal = parseOffer(
      raw[index],
      input.query,
      retailers,
      CONFIG[input.country].image,
      classify(raw[index]),
    );
    if (!deal) continue;
    const key = `${deal.retailer}|${deal.priceLabel}|${deal.description}|${deal.productName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deals.push(deal);
  }

  deals.sort(
    (a, b) => b.relevance - a.relevance || (a.priceValue ?? 1e9) - (b.priceValue ?? 1e9),
  );
  return deals;
}

/** Read this week's leaflets and any older brochures still in the archive. */
export async function studyLeaflets(input: {
  country: CountryCode;
  zip: string;
}): Promise<{ offers: number; already: boolean }> {
  if (input.country !== "de") throw new Error("Das Prospektarchiv ist derzeit nur für Deutschland verfügbar");
  // Archive every requested region, even when the model has already studied this week.
  const status = await rememberWeek();
  try {
    const lessons = await gatherLessons(input.zip, (offers) => rememberProducts(input.country, offers),
      async (offers) => { await archiveOffers(await getSql(), "de", input.zip, offers); });
    if (!status.already) await learnLessons(lessons);
  } catch (err) {
    console.error("leaflet study", err);
    throw err;
  }
  const view = await snapshotFor([]);
  return { offers: view.offers, already: status.already };
}
