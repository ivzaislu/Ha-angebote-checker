import { productCategory, queryDomain, incompatibleCategory } from "./product-category.ts";
/** Small query-conditioned classifier. No network calls or training at inference. */
export const PRODUCT_NET_VERSION = 2;
export const PRODUCT_ACCEPT_SCORE = 0.9;
export const PRODUCT_REJECT_SCORE = 0.1;
export const PRODUCT_INPUTS = 512;
export const PRODUCT_HIDDEN = 24;
export type ProductText = { intent: string; name: string; category: string; description: string };
export type ProductExample = ProductText & {
  positive: boolean;
  source: "curated" | "human" | "rules";
};
export type ProductNet = {
  version: 2;
  featureVersion?: 3;
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number;
  steps: number;
};
export function normalizedText(text: string): string {
  return text
    .toLocaleLowerCase("de")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function hashText(text: string): number {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) {
    n ^= text.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}
export function seededRandom(seed: number): () => number {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function newProductNet(seed = 173): ProductNet {
  const rand = seededRandom(seed);
  return {
    version: 2,
    w1: Array.from({ length: PRODUCT_INPUTS * PRODUCT_HIDDEN }, () => (rand() * 2 - 1) * 0.08),
    b1: Array(PRODUCT_HIDDEN).fill(0),
    w2: Array.from({ length: PRODUCT_HIDDEN }, () => (rand() * 2 - 1) * 0.2),
    b2: 0,
    steps: 0,
  };
}
export function validProductNet(value: unknown): value is ProductNet {
  const n = value as ProductNet | undefined;
  return Boolean(
    n &&
    n.version === 2 &&
    (n.featureVersion === undefined || n.featureVersion === 3) &&
    Array.isArray(n.w1) &&
    n.w1.length === PRODUCT_INPUTS * PRODUCT_HIDDEN &&
    Array.isArray(n.w2) &&
    n.w2.length === PRODUCT_HIDDEN &&
    Array.isArray(n.b1) &&
    n.b1.length === PRODUCT_HIDDEN &&
    [...n.w1, ...n.w2, ...n.b1, n.b2, n.steps].every(Number.isFinite) &&
    n.steps >= 0,
  );
}
/** Shared train/inference features: words, character fragments and intent×text pairs. */
export function productFeatures(row: ProductText, featureVersion: 2 | 3 = 2): number[] {
  const intent = normalizedText(row.intent).slice(0, 80);
  const name = normalizedText(row.name).slice(0, 180);
  const category = normalizedText(row.category).slice(0, 180);
  const description = normalizedText(row.description).slice(0, 600);
  const indices = new Set<number>();
  const add = (key: string, offset: number, size: number) =>
    indices.add(offset + (hashText(key) % size));
  for (const word of `${name} ${category} ${description}`.split(" ").filter(Boolean)) {
    add(`w:${word}`, 0, 352);
    add(`${intent}|w:${word}`, 416, 96);
  }
  for (const text of [name, category]) {
    const packed = text.replaceAll(" ", "");
    for (let i = 0; i < packed.length - 2; i++) {
      const tri = packed.slice(i, i + 3);
      add(`t:${tri}`, 0, 352);
      add(`${intent}|t:${tri}`, 416, 96);
    }
  }
  add(intent, 352, 64);
  for (const word of intent.split(" ")) add(`i:${word}`, 352, 64);
  if (featureVersion === 3) {
    const group = productCategory(row.category);
    for (const key of [
      `category:${group.id}`,
      `domain:${group.domain}`,
      `query-domain:${queryDomain(row.intent)}`,
      `category-relation:${incompatibleCategory(row.intent, row.category) ? "incompatible" : "unresolved-or-compatible"}`,
    ]) {
      add(key, 0, 352);
      add(`${intent}|${key}`, 416, 96);
    }
  }
  return [...indices].sort((a, b) => a - b);
}
function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}
function forward(net: ProductNet, features: number[]) {
  const hidden = net.b1.slice();
  for (let h = 0; h < PRODUCT_HIDDEN; h++)
    for (const index of features) hidden[h] += net.w1[h * PRODUCT_INPUTS + index];
  const activated = hidden.map((n) => (n > 0 ? n : n * 0.05));
  const score = net.b2 + activated.reduce((sum, n, h) => sum + n * net.w2[h], 0);
  return { probability: sigmoid(score), hidden, activated };
}
export function productProbability(net: ProductNet, row: ProductText): number {
  return forward(net, productFeatures(row, net.featureVersion ?? 2)).probability;
}
export function binaryLoss(probability: number, positive: boolean): number {
  const p = Math.max(1e-8, Math.min(1 - 1e-8, probability));
  return positive ? -Math.log(p) : -Math.log(1 - p);
}
export function productTrainingStep(
  net: ProductNet,
  features: number[],
  positive: boolean,
  rate: number,
  weight = 1,
): number {
  const { probability, hidden, activated } = forward(net, features);
  const delta = Math.max(-3, Math.min(3, (probability - Number(positive)) * weight));
  const clip = (n: number) => Math.max(-8, Math.min(8, n));
  for (let h = 0; h < PRODUCT_HIDDEN; h++) {
    const d = delta * net.w2[h] * (hidden[h] > 0 ? 1 : 0.05);
    const offset = h * PRODUCT_INPUTS;
    for (const index of features) net.w1[offset + index] = clip(net.w1[offset + index] - rate * d);
    net.b1[h] = clip(net.b1[h] - rate * d);
    net.w2[h] = clip(net.w2[h] - rate * delta * activated[h]);
  }
  net.b2 = clip(net.b2 - rate * delta);
  net.steps++;
  return binaryLoss(probability, positive);
}
