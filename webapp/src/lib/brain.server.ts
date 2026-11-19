import { decideOffer, emptyBrain, ensureModelNet, intentView, learn, rollWeek, suggestFromModel, type BrainModel, type BrainView, type FlyerHint, type Lesson } from "@/lib/brain";
import { getSql } from "@/lib/db";
import { exactQueryFor, offerFits } from "@/lib/exact";
import { flyerWeekStart } from "@/lib/week";

type BrainGlobal = typeof globalThis & {
  __offerBrain?: BrainModel;
  __offerBrainLock?: Promise<void>;
};

const brainGlobal = globalThis as BrainGlobal;

export type OfferLesson = {
  name: string;
  description: string;
  category: string;
};

export function intentOf(query: string): string {
  return exactQueryFor(query)?.query ?? query.trim().replace(/\s+/g, " ");
}

export function lessonsFor(query: string, offers: OfferLesson[]): Lesson[] {
  const intent = intentOf(query);
  if (!intent) return [];
  const lessons: Lesson[] = [];
  for (const offer of offers) {
    const name = offer.name.trim();
    if (name.length < 3) continue;
    lessons.push({
      intent,
      name,
      category: offer.category,
      positive: offerFits(query, name, offer.description, offer.category),
    });
  }
  return lessons;
}

export function decideObserved(
  model: BrainModel,
  query: string,
  offer: OfferLesson,
): { keep: boolean; fromBrain: boolean } {
  return decideOffer(model, intentOf(query), query, offer.name || "", offer.description, offer.category);
}

function weekKey(now = new Date()): string {
  const start = flyerWeekStart(now);
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${start.getFullYear()}-${month}-${day}`;
}

async function readModel(): Promise<BrainModel> {
  if (brainGlobal.__offerBrain) return brainGlobal.__offerBrain;
  const sql = await getSql();
  const rows = await sql.query<{ model: string }>("select model from offer_brain where id = $1", ["main"]);
  if (!rows[0]?.model) {
    brainGlobal.__offerBrain = emptyBrain();
    return brainGlobal.__offerBrain;
  }
  try {
    const parsed = JSON.parse(rows[0].model) as BrainModel;
    if (!parsed?.intents) brainGlobal.__offerBrain = emptyBrain();
    else {
      ensureModelNet(parsed);
      brainGlobal.__offerBrain = parsed;
    }
  } catch {
    brainGlobal.__offerBrain = emptyBrain();
  }
  return brainGlobal.__offerBrain;
}

async function writeModel(model: BrainModel): Promise<void> {
  brainGlobal.__offerBrain = model;
  const sql = await getSql();
  await sql.query(
    `insert into offer_brain (id, model, updated_at) values ($1, $2, now())
     on conflict (id) do update set model = excluded.model, updated_at = now()`,
    ["main", JSON.stringify(model)],
  );
}

async function locked<T>(fn: (model: BrainModel) => Promise<T> | T): Promise<T> {
  const previous = brainGlobal.__offerBrainLock ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  brainGlobal.__offerBrainLock = gate;
  await previous.catch(() => undefined);
  try {
    const model = await readModel();
    return await fn(model);
  } finally {
    release();
  }
}

export async function observeOffers(
  query: string,
  offers: OfferLesson[],
): Promise<Array<{ keep: boolean; fromBrain: boolean }>> {
  const lessons = lessonsFor(query, offers);
  return locked(async (model) => {
    learn(model, lessons);
    await writeModel(model);
    return offers.map((offer) => decideObserved(model, query, offer));
  });
}

export async function rememberWeek(): Promise<{ week: string; already: boolean; offers: number }> {
  const week = weekKey();
  return locked(async (model) => {
    if (model.week === week && model.offers > 0) {
      return { week, already: true, offers: model.offers };
    }
    rollWeek(model, week);
    await writeModel(model);
    return { week, already: false, offers: model.offers };
  });
}

export async function hintsFor(prefix: string): Promise<FlyerHint[]> {
  const model = await readModel();
  return suggestFromModel(model, prefix, 6);
}

export async function snapshotFor(queries: string[]): Promise<BrainView> {
  const model = await readModel();
  const intents = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const intent = intentOf(query);
    if (!intent || seen.has(intent)) continue;
    seen.add(intent);
    const view = intentView(model.intents[intent], query, intent);
    if (view) intents.push(view);
  }
  const net = ensureModelNet(model);
  return { offers: model.offers, week: model.week, steps: net.steps, loss: net.loss, intents };
}
