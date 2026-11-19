import { hardReject, offerFits } from "@/lib/exact";

export type SeenName = { name: string; n: number };

export type IntentMemory = {
  pos: number;
  neg: number;
  tokens: Record<string, [number, number]>;
  yes: SeenName[];
  no: SeenName[];
};

export type BrainModel = {
  offers: number;
  week: string;
  intents: Record<string, IntentMemory>;
};

export type Lesson = {
  intent: string;
  name: string;
  category: string;
  positive: boolean;
};

export type FlyerHint = { name: string; intent: string; seen: number };

export type BrainIntentView = {
  query: string;
  intent: string;
  seen: number;
  names: string[];
  rejected: string[];
};

export type BrainView = {
  offers: number;
  week: string;
  intents: BrainIntentView[];
};

const STOP = new Set([
  "und",
  "mit",
  "aus",
  "von",
  "fur",
  "oder",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "ein",
  "eine",
  "einer",
  "einem",
  "pack",
  "stuck",
  "stueck",
  "gramm",
  "liter",
  "kilo",
]);

export function emptyBrain(): BrainModel {
  return { offers: 0, week: "", intents: {} };
}

export function foldBrain(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function brainTokens(value: string): string[] {
  const raw = foldBrain(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP.has(word));
  return [...new Set(raw)].slice(0, 10);
}

function blankIntent(): IntentMemory {
  return { pos: 0, neg: 0, tokens: {}, yes: [], no: [] };
}

function bumpName(list: SeenName[], name: string): void {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 3) return;
  const key = foldBrain(clean);
  const found = list.find((entry) => foldBrain(entry.name) === key);
  if (found) found.n += 1;
  else list.push({ name: clean, n: 1 });
  list.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  list.splice(8);
}

function touchToken(slot: IntentMemory, token: string, positive: boolean): void {
  const pair = slot.tokens[token] ?? [0, 0];
  if (positive) pair[0] += 1;
  else pair[1] += 1;
  slot.tokens[token] = pair;
}

/** Halve what last week's leaflets taught, so the new assortment can take over. */
export function rollWeek(model: BrainModel, week: string): void {
  if (model.week && week && model.week !== week) {
    for (const slot of Object.values(model.intents)) {
      slot.pos = Math.floor(slot.pos / 2);
      slot.neg = Math.floor(slot.neg / 2);
      for (const token of Object.keys(slot.tokens)) {
        const [pos, neg] = slot.tokens[token];
        const next: [number, number] = [Math.floor(pos / 2), Math.floor(neg / 2)];
        if (next[0] + next[1] === 0) delete slot.tokens[token];
        else slot.tokens[token] = next;
      }
      slot.yes = slot.yes.flatMap((entry) => {
        const n = Math.floor(entry.n / 2);
        return n > 0 ? [{ ...entry, n }] : [];
      });
      slot.no = slot.no.flatMap((entry) => {
        const n = Math.floor(entry.n / 2);
        return n > 0 ? [{ ...entry, n }] : [];
      });
    }
  }
  if (week) model.week = week;
  prune(model);
}

export function learn(model: BrainModel, lessons: Lesson[]): void {
  for (const lesson of lessons) {
    const intent = lesson.intent.trim();
    const name = lesson.name.trim();
    if (!intent || name.length < 3) continue;
    const slot = model.intents[intent] ?? blankIntent();
    model.intents[intent] = slot;
    if (lesson.positive) {
      slot.pos += 1;
      bumpName(slot.yes, name);
    } else {
      slot.neg += 1;
      bumpName(slot.no, name);
    }
    for (const token of brainTokens(name)) touchToken(slot, token, lesson.positive);
    model.offers += 1;
  }
  prune(model);
}

function prune(model: BrainModel): void {
  for (const intent of Object.keys(model.intents)) {
    const slot = model.intents[intent];
    if (slot.pos + slot.neg === 0 && slot.yes.length === 0) {
      delete model.intents[intent];
      continue;
    }
    const ranked = Object.entries(slot.tokens).sort(
      (a, b) => b[1][0] + b[1][1] - (a[1][0] + a[1][1]),
    );
    slot.tokens = Object.fromEntries(ranked.slice(0, 40));
  }
  const intents = Object.entries(model.intents).sort(
    (a, b) => b[1].pos + b[1].neg - (a[1].pos + a[1].neg),
  );
  model.intents = Object.fromEntries(intents.slice(0, 180));
}

function yesTokens(slot: IntentMemory): Set<string> {
  const tokens = new Set<string>();
  for (const entry of slot.yes) {
    for (const token of brainTokens(entry.name)) tokens.add(token);
  }
  return tokens;
}

/** A token stores keep using for this product, and rarely for lookalikes. */
export function supportToken(slot: IntentMemory, name: string): string | null {
  if (slot.pos < 3) return null;
  const allowed = yesTokens(slot);
  let best: string | null = null;
  let bestPos = 0;
  for (const token of brainTokens(name)) {
    if (!allowed.has(token)) continue;
    const [pos, neg] = slot.tokens[token] ?? [0, 0];
    if (pos >= 3 && pos > neg * 2 && pos > bestPos) {
      best = token;
      bestPos = pos;
    }
  }
  return best;
}

/** A lookalike the leaflets have already shown for this search. */
export function vetoName(slot: IntentMemory, name: string): string | null {
  if (slot.neg < 2) return null;
  const packed = foldBrain(name).replace(/[^a-z0-9]+/g, "");
  for (const entry of slot.no) {
    if (entry.n < 2) continue;
    const proto = foldBrain(entry.name).replace(/[^a-z0-9]+/g, "");
    if (proto.length >= 8 && packed.includes(proto)) return entry.name;
  }
  for (const token of brainTokens(name)) {
    const [pos, neg] = slot.tokens[token] ?? [0, 0];
    if (neg >= 3 && neg > pos * 2 && !yesTokens(slot).has(token)) return token;
  }
  return null;
}

export function decideOffer(
  model: BrainModel,
  intent: string,
  query: string,
  name: string,
  description: string,
  category: string,
): { keep: boolean; fromBrain: boolean } {
  const fits = offerFits(query, name, description, category);
  const slot = model.intents[intent];
  if (!slot) return { keep: fits, fromBrain: false };
  if (fits && vetoName(slot, name)) return { keep: false, fromBrain: true };
  if (!fits && !hardReject(query, name, description, category) && supportToken(slot, name)) {
    return { keep: true, fromBrain: true };
  }
  return { keep: fits, fromBrain: false };
}

export function suggestFromModel(model: BrainModel, prefix: string, limit = 6): FlyerHint[] {
  const needle = foldBrain(prefix.trim());
  if (needle.length < 2) return [];
  const hints: FlyerHint[] = [];
  for (const [intent, slot] of Object.entries(model.intents)) {
    for (const entry of slot.yes) {
      const folded = foldBrain(entry.name);
      const intentFold = foldBrain(intent);
      if (!folded.startsWith(needle) && !folded.includes(needle) && !intentFold.startsWith(needle)) continue;
      hints.push({ name: entry.name, intent, seen: entry.n });
    }
  }
  hints.sort((a, b) => {
    const aStart = foldBrain(a.name).startsWith(needle) ? 1 : 0;
    const bStart = foldBrain(b.name).startsWith(needle) ? 1 : 0;
    return bStart - aStart || b.seen - a.seen || a.name.localeCompare(b.name);
  });
  const seen = new Set<string>();
  const unique: FlyerHint[] = [];
  for (const hint of hints) {
    const key = foldBrain(hint.name);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hint);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function intentView(slot: IntentMemory | undefined, query: string, intent: string): BrainIntentView | null {
  if (!slot || (slot.yes.length === 0 && slot.no.length === 0)) return null;
  return {
    query,
    intent,
    seen: slot.pos,
    names: slot.yes.slice(0, 5).map((entry) => entry.name),
    rejected: slot.no.slice(0, 4).map((entry) => entry.name),
  };
}
