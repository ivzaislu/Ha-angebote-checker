import { EXACT_QUERIES, exactQueryFor, hardReject, offerFits } from "@/lib/exact";
import type { Lesson } from "@/lib/brain";
import { flyerWeekStart } from "@/lib/week";

const KEYS = {
  apiKey: "8Kk+pmbf7TgJ9nVj2cXeA7P5zBGv8iuutVVMRfOfvNE=",
  clientKey: "WU/RH+PMGDi+gkZer3WbMelt6zcYHSTytNB7VpTia90=",
};
const GROCERY = new Set(["Supermarkt", "Discounter", "Biomarkt", "Getränkemarkt"]);

type Raw = {
  name?: string | null;
  description?: string | null;
  product?: { name?: string | null };
  categories?: { name?: string | null }[];
};

const headers = {
  "x-apikey": KEYS.apiKey,
  "x-clientkey": KEYS.clientKey,
  accept: "application/json",
  "user-agent": "Mozilla/5.0",
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function pool<T>(items: T[], width: number, run: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) return;
        await run(item);
      }
    }),
  );
}

/** Current search pages plus leaflet brochures that started before this week. */
export async function gatherLessons(zip: string): Promise<Lesson[]> {
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
      for (const entry of data?.results ?? []) {
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

  const weekStart = flyerWeekStart();
  const index = await getJson<{
    results?: { name?: string; leafletFlights?: { mainLeafletId?: number; offerCount?: number; validFrom?: string }[] }[];
  }>(`https://api.marktguru.de/api/v1/leafletflights/industries?as=web&zipCode=${encodeURIComponent(zip)}`);
  const leaflets: number[] = [];
  for (const industry of index?.results ?? []) {
    if (!GROCERY.has(industry.name ?? "")) continue;
    for (const flight of industry.leafletFlights ?? []) {
      if (!flight.mainLeafletId || !(flight.offerCount && flight.offerCount > 0)) continue;
      const from = flight.validFrom ? new Date(flight.validFrom) : null;
      if (from && from >= weekStart) continue;
      leaflets.push(flight.mainLeafletId);
    }
  }

  const offerIds = new Set<number>();
  await pool(leaflets, 3, async (id) => {
    const leaflet = await getJson<{ children?: { id?: string }[] }>(
      `https://api.marktguru.de/api/v1/leaflets/${id}?as=web`,
    );
    for (const child of (leaflet?.children ?? []).slice(0, 80)) {
      const offerId = Number((child.id ?? "").replace("offers/", ""));
      if (Number.isFinite(offerId)) offerIds.add(offerId);
    }
  });
  await pool([...offerIds], 6, async (id) => {
    const entry = await getJson<Raw>(`https://api.marktguru.de/api/v1/offers/${id}?as=web`);
    if (!entry) return;
    const name = (entry.product?.name || entry.name || "").trim();
    if (name.length < 3) return;
    const category = entry.categories?.[0]?.name ?? "";
    const description = entry.description || "";
    for (const rule of EXACT_QUERIES) {
      const fits = offerFits(rule.query, name, description, category);
      if (!fits && !hardReject(rule.query, name, description, category)) continue;
      lessons.push({ intent: rule.query, name, category, positive: fits });
    }
  });
  return lessons;
}
