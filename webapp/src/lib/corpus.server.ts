import { EXACT_QUERIES, exactQueryFor, hardReject, offerFits } from "./exact.ts";
import type { Lesson } from "@/lib/brain";
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
export async function gatherLessons(zip: string, observe?: (offers: ProductObservation[]) => Promise<void>, archive?: (offers: ArchiveOffer[]) => Promise<void>): Promise<Lesson[]> {
  const discovered: ProductObservation[] = [];
  const lessons: Lesson[] = [];
  await pool(
    EXACT_QUERIES.map((rule) => rule.query),
    4,
    async (query) => {
      const intent = exactQueryFor(query)?.query ?? query;
      const url = new URL("https://api.marktguru.de/api/v1/offers/search");
      url.searchParams.set("as", "web");
      url.searchParams.set("limit", "40");
      url.searchParams.set("offset", "0");
      url.searchParams.set("q", query);
      url.searchParams.set("zipCode", zip);
      const data = await getJson<{ results?: Raw[] }>(url.toString());
      if (archive) await archive(data.results ?? []);
      for (const entry of data.results ?? []) {
        discovered.push({ name: entry.product?.name || entry.name || "", category: entry.categories?.[0]?.name ?? "" });
        const name = (entry.product?.name || entry.name || "").trim();
        if (name.length < 3) continue;
        const category = entry.categories?.[0]?.name ?? "";
        lessons.push({
          intent,
          name,
          category,
          positive: offerFits(query, name, entry.description || "", category),
        });
      }
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
    const name = (entry.product?.name || entry.name || "").trim();
    if (name.length < 3) return;
    const category = entry.categories?.[0]?.name ?? "";
    const description = entry.description || "";
    discovered.push({ name, category });
    for (const rule of EXACT_QUERIES) {
      const fits = offerFits(rule.query, name, description, category);
      if (!fits && !hardReject(rule.query, name, description, category)) continue;
      lessons.push({ intent: rule.query, name, category, positive: fits });
    }
  });
  if (observe && discovered.length) await observe(discovered);
  return lessons;
}
