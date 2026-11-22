import { EXACT_QUERIES } from "./exact.ts";
import type { ProductObservation } from "@/lib/product-knowledge.server";
import type { ArchiveOffer } from "./offer-archive.ts";

const KEYS = {
  apiKey: "8Kk+pmbf7TgJ9nVj2cXeA7P5zBGv8iuutVVMRfOfvNE=",
  clientKey: "WU/RH+PMGDi+gkZer3WbMelt6zcYHSTytNB7VpTia90=",
};
const GROCERY = new Set(["Supermarkt", "Discounter", "Biomarkt", "Getränkemarkt"]);

type Raw = ArchiveOffer;

const headers = {
  "x-apikey": KEYS.apiKey,
  "x-clientkey": KEYS.clientKey,
  accept: "application/json",
  "user-agent": "Mozilla/5.0",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Marktguru collection failed: ${res.status}`);
  return (await res.json()) as T;
}

async function pool<T>(items: T[], width: number, run: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const results = await Promise.allSettled(
    Array.from({ length: width }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) return;
        await run(item);
      }
    }),
  );
  const failed = results.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}

/** Bounded collection of search pages and currently discoverable grocery leaflets (first 80 entries per leaflet). */
export async function gatherOffers(zip: string, observe?: (offers: ProductObservation[]) => Promise<void>, archive?: (offers: ArchiveOffer[]) => Promise<void>): Promise<number> {
  const discovered: ProductObservation[] = [];
  const seen = new Set<string>();
  const observeOffer = (entry: Raw) => {
    const name = (entry.product?.name || entry.name || "").trim();
    if (!name) return;
    seen.add(String(entry.id ?? JSON.stringify([name, entry.retailerName, entry.description])));
    discovered.push({name, category:entry.categories?.[0]?.name ?? "", retailer:entry.advertisers?.[0]?.name || entry.retailerName || "", offerId:entry.id,price:entry.price});
  };
  await pool(
    EXACT_QUERIES.map((rule) => rule.query),
    4,
    async (query) => {
      const url = new URL("https://api.marktguru.de/api/v1/offers/search");
      url.searchParams.set("as", "web");
      url.searchParams.set("limit", "40");
      url.searchParams.set("offset", "0");
      url.searchParams.set("q", query);
      url.searchParams.set("zipCode", zip);
      const data = await getJson<{ results?: Raw[] }>(url.toString());
      if (archive) await archive(data.results ?? []);
      for (const entry of data.results ?? []) observeOffer(entry);
    },
  );

  const index = await getJson<{
    results?: { name?: string; leafletFlights?: { mainLeafletId?: number; offerCount?: number; validFrom?: string }[] }[];
  }>(`https://api.marktguru.de/api/v1/leafletflights/industries?as=web&zipCode=${encodeURIComponent(zip)}`);
  const leaflets: number[] = [];
  for (const industry of index?.results ?? []) {
    if (!GROCERY.has(industry.name ?? "")) continue;
    for (const flight of industry.leafletFlights ?? []) {
      if (!flight.mainLeafletId || !(flight.offerCount && flight.offerCount > 0)) continue;
      leaflets.push(flight.mainLeafletId);
    }
  }

  const offerIds = new Set<number>();
  await pool([...new Set(leaflets)], 3, async (id) => {
    const leaflet = await getJson<{ children?: { id?: string }[] }>(
      `https://api.marktguru.de/api/v1/leaflets/${id}?as=web`,
    );
    for (const child of (leaflet?.children ?? []).slice(0, 80)) {
      const match = (child.id ?? "").match(/^(?:offers\/)?([1-9]\d*)$/);
      if (match) offerIds.add(Number(match[1]));
    }
  });
  await pool([...offerIds], 6, async (id) => {
    const entry = await getJson<Raw>(`https://api.marktguru.de/api/v1/offers/${id}?as=web`);
    if (archive) await archive([{ ...entry, id: entry.id ?? id }]);
    observeOffer({ ...entry, id:entry.id ?? id });
  });
  if (observe && discovered.length) await observe(discovered);
  return seen.size;
}
