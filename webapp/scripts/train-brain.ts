import { writeFileSync } from "node:fs";
import { EXACT_QUERIES, exactQueryFor, hardReject, offerFits } from "@/lib/exact";
import { emptyBrain, learn, type Lesson } from "@/lib/brain";
import { predict } from "@/lib/net";

const KEYS = {
  apiKey: "8Kk+pmbf7TgJ9nVj2cXeA7P5zBGv8iuutVVMRfOfvNE=",
  clientKey: "WU/RH+PMGDi+gkZer3WbMelt6zcYHSTytNB7VpTia90=",
};
const ZIP = "10115";
const GROCERY = new Set(["Supermarkt", "Discounter", "Biomarkt", "Getränkemarkt"]);

type Raw = {
  name?: string | null;
  description?: string | null;
  product?: { name?: string | null };
  categories?: { name?: string | null }[];
  id?: number | string;
};

const headers = {
  "x-apikey": KEYS.apiKey,
  "x-clientkey": KEYS.clientKey,
  accept: "application/json",
  "user-agent": "Mozilla/5.0",
};

async function getJson<T>(url: string): Promise<T> {
  let last = "failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return (await res.json()) as T;
    last = `${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

async function pool<T>(items: T[], width: number, run: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) return;
        try {
          await run(item);
        } catch (err) {
          console.error("skip", err instanceof Error ? err.message : err);
        }
      }
    }),
  );
}

function lessonKey(lesson: Lesson): string {
  return `${lesson.intent}|${lesson.positive ? "1" : "0"}|${lesson.name.toLowerCase()}`;
}

async function searchLessons(): Promise<Lesson[]> {
  const lessons: Lesson[] = [];
  await pool(EXACT_QUERIES.map((rule) => rule.query), 5, async (query) => {
    const intent = exactQueryFor(query)?.query ?? query;
    let offset = 0;
    for (let page = 0; page < 3; page += 1) {
      const url = new URL("https://api.marktguru.de/api/v1/offers/search");
      url.searchParams.set("as", "web");
      url.searchParams.set("limit", "80");
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("q", query);
      url.searchParams.set("zipCode", ZIP);
      const data = await getJson<{ totalResults?: number; results?: Raw[] }>(url.toString());
      const results = data.results ?? [];
      for (const entry of results) {
        const name = (entry.product?.name || entry.name || "").trim();
        if (name.length < 3) continue;
        const category = entry.categories?.[0]?.name ?? "";
        const description = entry.description || "";
        lessons.push({
          intent,
          name,
          category,
          positive: offerFits(query, name, description, category),
        });
      }
      offset += results.length;
      if (results.length < 80 || offset >= (data.totalResults ?? 0) || offset >= 160) break;
    }
    console.log("search", query, lessons.length);
  });
  return lessons;
}

async function archiveLessons(): Promise<Lesson[]> {
  const index = await getJson<{ results?: { name?: string; leafletFlights?: { mainLeafletId?: number; offerCount?: number; validFrom?: string }[] }[] }>(
    `https://api.marktguru.de/api/v1/leafletflights/industries?as=web&zipCode=${ZIP}`,
  );
  const leaflets: number[] = [];
  for (const industry of index.results ?? []) {
    if (!GROCERY.has(industry.name ?? "")) continue;
    for (const flight of industry.leafletFlights ?? []) {
      if (!flight.mainLeafletId || !(flight.offerCount && flight.offerCount > 0)) continue;
      leaflets.push(flight.mainLeafletId);
    }
  }
  const offerIds = new Set<number>();
  await pool(leaflets, 4, async (id) => {
    const leaflet = await getJson<{ validFrom?: string; children?: { id?: string }[] }>(
      `https://api.marktguru.de/api/v1/leaflets/${id}?as=web`,
    );
    const children = leaflet.children ?? [];
    const cap = (leaflet.validFrom ?? "") < "2026-11-12" ? 120 : 40;
    for (const child of children.slice(0, cap)) {
      const raw = child.id ?? "";
      const offerId = Number(raw.replace("offers/", ""));
      if (Number.isFinite(offerId)) offerIds.add(offerId);
    }
    console.log("leaflet", id, leaflet.validFrom?.slice(0, 10), children.length);
  });

  const lessons: Lesson[] = [];
  const ids = [...offerIds];
  console.log("archive offers", ids.length);
  await pool(ids, 8, async (id) => {
    const entry = await getJson<Raw>(`https://api.marktguru.de/api/v1/offers/${id}?as=web`);
    const name = (entry.product?.name || entry.name || "").trim();
    if (name.length < 3) return;
    const category = entry.categories?.[0]?.name ?? "";
    const description = entry.description || "";
    for (const rule of EXACT_QUERIES) {
      const fits = offerFits(rule.query, name, description, category);
      const rejected = hardReject(rule.query, name, description, category);
      if (!fits && !rejected) continue;
      lessons.push({ intent: rule.query, name, category, positive: fits });
    }
  });
  return lessons;
}

function roundNet(values: number[]): number[] {
  return values.map((value) => Math.round(value * 1e5) / 1e5);
}

const search = await searchLessons();
const archived = await archiveLessons();
const seen = new Set<string>();
const lessons: Lesson[] = [];
for (const lesson of [...search, ...archived]) {
  const key = lessonKey(lesson);
  if (seen.has(key)) continue;
  seen.add(key);
  lessons.push(lesson);
}
console.log("unique lessons", lessons.length, "positive", lessons.filter((lesson) => lesson.positive).length);

const byIntent = new Map<string, { yes: Lesson[]; no: Lesson[] }>();
for (const lesson of lessons) {
  const bucket = byIntent.get(lesson.intent) ?? { yes: [], no: [] };
  byIntent.set(lesson.intent, bucket);
  (lesson.positive ? bucket.yes : bucket.no).push(lesson);
}
const balanced: Lesson[] = [];
for (const bucket of byIntent.values()) {
  if (bucket.yes.length === 0) continue;
  balanced.push(...bucket.yes);
  const negCap = Math.min(bucket.no.length, bucket.yes.length * 2);
  balanced.push(...bucket.no.slice(0, negCap));
}
console.log("balanced", balanced.length, "positive", balanced.filter((lesson) => lesson.positive).length);

const model = emptyBrain();
model.week = "2026-11-18";
learn(model, balanced, 4, 0.12);

const checks: [string, string, string][] = [
  ["Gurke", "Snack-Gurken", "Gemüse"],
  ["Gurke", "Gurktaler", "Spirituosen"],
  ["Milch", "Frische Milch", "Milch"],
  ["Milch", "Buttermilch", "Milch"],
  ["Lachs", "Lachsfilet", "Fisch"],
  ["Lachs", "Seelachs", "Fisch"],
];
for (const [intent, name, category] of checks) {
  console.log(intent, name, predict(model.net, intent, `${name} ${category}`).toFixed(3));
}
console.log("steps", model.net.steps, "loss", model.net.loss.toFixed(3), "offers", model.offers);

model.net.w1 = roundNet(model.net.w1);
model.net.w2 = roundNet(model.net.w2);
model.net.b1 = roundNet(model.net.b1);
model.net.b2 = Math.round(model.net.b2 * 1e5) / 1e5;
writeFileSync(new URL("../src/lib/trained-brain.json", import.meta.url), JSON.stringify(model));
console.log("wrote trained-brain.json");
