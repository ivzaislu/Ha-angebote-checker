/** Small feed-forward net: leaflet title + intent → probability it is that product. */

export const NET_NAME = 256;
export const NET_INTENT = 32;
export const NET_IN = NET_NAME + NET_INTENT;
export const NET_HIDDEN = 16;
const MIN_STEPS = 40;
const LEARNING_RATE = 0.35;

export type Net = {
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number;
  steps: number;
  loss: number;
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNet(): Net {
  const rand = mulberry32(20261119);
  const inScale = Math.sqrt(2 / NET_IN);
  const hiddenScale = Math.sqrt(2 / NET_HIDDEN);
  const w1 = Array.from({ length: NET_HIDDEN * NET_IN }, () => (rand() * 2 - 1) * inScale);
  const w2 = Array.from({ length: NET_HIDDEN }, () => (rand() * 2 - 1) * hiddenScale);
  return {
    w1,
    b1: Array.from({ length: NET_HIDDEN }, () => 0),
    w2,
    b2: 0,
    steps: 0,
    loss: 0,
  };
}

export function netReady(net: Net | undefined | null): net is Net {
  return Boolean(
    net &&
      net.w1.length === NET_HIDDEN * NET_IN &&
      net.w2.length === NET_HIDDEN &&
      net.b1.length === NET_HIDDEN &&
      Number.isFinite(net.b2),
  );
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function fnv(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Hashed character trigrams and whole words. Name and intent do not share buckets. */
export function features(intent: string, text: string): Float64Array {
  const vector = new Float64Array(NET_IN);
  const name = fold(text).replace(/[^a-z0-9]+/g, "");
  const intentKey = fold(intent).replace(/[^a-z0-9]+/g, "");
  for (let i = 0; i < name.length - 2; i += 1) {
    vector[fnv(name.slice(i, i + 3)) % NET_NAME] += 1;
  }
  for (const word of fold(text).split(/[^a-z0-9]+/)) {
    if (word.length >= 4) vector[fnv(`w:${word}`) % NET_NAME] += 1;
  }
  for (let i = 0; i < intentKey.length - 2; i += 1) {
    vector[NET_NAME + (fnv(intentKey.slice(i, i + 3)) % NET_INTENT)] += 1;
  }
  if (intentKey) vector[NET_NAME + (fnv(`i:${intentKey}`) % NET_INTENT)] += 1;

  for (let i = 0; i < NET_NAME; i += 1) vector[i] = vector[i] > 0 ? 1 : 0;
  for (let i = NET_NAME; i < NET_IN; i += 1) vector[i] = vector[i] > 0 ? 0.25 : 0;
  return vector;
}

function sigmoid(value: number): number {
  if (value > 12) return 1;
  if (value < -12) return 0;
  return 1 / (1 + Math.exp(-value));
}

export function predict(net: Net, intent: string, text: string): number {
  return forward(net, features(intent, text)).probability;
}

function forward(net: Net, input: Float64Array): { probability: number; hidden: Float64Array; activated: Float64Array } {
  const hidden = new Float64Array(NET_HIDDEN);
  const activated = new Float64Array(NET_HIDDEN);
  for (let row = 0; row < NET_HIDDEN; row += 1) {
    let sum = net.b1[row];
    const offset = row * NET_IN;
    for (let col = 0; col < NET_IN; col += 1) sum += net.w1[offset + col] * input[col];
    hidden[row] = sum;
    activated[row] = sum > 0 ? sum : 0;
  }
  let logit = net.b2;
  for (let row = 0; row < NET_HIDDEN; row += 1) logit += net.w2[row] * activated[row];
  return { probability: sigmoid(logit), hidden, activated };
}

function clip(value: number): number {
  if (value > 5) return 5;
  if (value < -5) return -5;
  return value;
}

/** One stochastic gradient step on binary cross-entropy. Returns the loss. */
export function trainExample(net: Net, intent: string, text: string, positive: boolean, lr = LEARNING_RATE): number {
  const input = features(intent, text);
  const target = positive ? 1 : 0;
  const { probability, hidden, activated } = forward(net, input);
  const clipped = Math.min(1 - 1e-8, Math.max(1e-8, probability));
  const loss = -(target * Math.log(clipped) + (1 - target) * Math.log(1 - clipped));
  const delta = probability - target;

  for (let row = 0; row < NET_HIDDEN; row += 1) {
    const hiddenDelta = hidden[row] > 0 ? delta * net.w2[row] : 0;
    net.w2[row] = clip(net.w2[row] - lr * delta * activated[row]);
    net.b1[row] = clip(net.b1[row] - lr * hiddenDelta);
    const offset = row * NET_IN;
    for (let col = 0; col < NET_IN; col += 1) {
      if (input[col] === 0) continue;
      net.w1[offset + col] = clip(net.w1[offset + col] - lr * hiddenDelta * input[col]);
    }
  }
  net.b2 = clip(net.b2 - lr * delta);
  net.steps += 1;
  net.loss = net.steps === 1 ? loss : net.loss * 0.95 + loss * 0.05;
  return loss;
}

export function trainLessons(
  net: Net,
  lessons: { intent: string; text: string; positive: boolean }[],
  passes = 4,
  lr = LEARNING_RATE,
): void {
  if (lessons.length === 0) return;
  for (let pass = 0; pass < passes; pass += 1) {
    for (const lesson of lessons) {
      trainExample(net, lesson.intent, lesson.text, lesson.positive, lr);
      if (lesson.positive) trainExample(net, lesson.intent, lesson.text, true, lr);
    }
  }
}

/** Pull weights back toward zero so last week's assortment loses confidence. */
export function decayNet(net: Net, factor = 0.5): void {
  for (let i = 0; i < net.w1.length; i += 1) net.w1[i] *= factor;
  for (let i = 0; i < net.w2.length; i += 1) net.w2[i] *= factor;
  for (let i = 0; i < net.b1.length; i += 1) net.b1[i] *= factor;
  net.b2 *= factor;
  net.loss *= factor;
}

/**
 * The net may override the handwritten rules only after it has trained,
 * and never when a hard false-friend reject already fired.
 */
export function applyNetDecision(
  fits: boolean,
  rejected: boolean,
  probability: number,
  steps: number,
): { keep: boolean; fromBrain: boolean } {
  if (rejected) return { keep: false, fromBrain: false };
  if (steps < MIN_STEPS) return { keep: fits, fromBrain: false };
  if (fits && probability < 0.2) return { keep: false, fromBrain: true };
  if (!fits && probability > 0.8) return { keep: true, fromBrain: true };
  return { keep: fits, fromBrain: false };
}
