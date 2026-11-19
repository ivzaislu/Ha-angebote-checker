import { exactQueryFor, hardReject, offerFits } from "./exact.ts";
import { compatibleSalmon } from "./product-variants.ts";
import { normalizedText, productProbability, type ProductText } from "./product-net.ts";
import type { ProductModelPackage } from "./product-model-store.ts";
export type ProductDecision = {
  keep: boolean;
  fromBrain: boolean;
  score: number | null;
  modelId: string | null;
};
export function decideProduct(
  model: ProductModelPackage | null,
  row: ProductText,
): ProductDecision {
  const fallback = offerFits(row.intent, row.name, row.description, row.category);
  const decision = {
    keep: fallback,
    fromBrain: false,
    score: null as number | null,
    modelId: null as string | null,
  };
  if (
    hardReject(row.intent, row.name, row.description, row.category) ||
    !compatibleSalmon(row.intent, row.name)
  )
    return { ...decision, keep: false };
  if (!model || !model.report.eligible) return decision;
  const intent = exactQueryFor(row.intent)?.query ?? row.intent;
  if (!model.report.supportedIntents.includes(intent)) return decision;
  const known = new Set(model.report.vocabulary);
  if (
    !normalizedText(`${row.name} ${row.category} ${row.description}`)
      .split(" ")
      .some((word) => word.length >= 3 && known.has(word))
  )
    return decision;
  const score = productProbability(model.net, { ...row, intent });
  if (score >= 0.9) return { keep: true, fromBrain: true, score, modelId: model.id };
  if (score <= 0.1) return { keep: false, fromBrain: true, score, modelId: model.id };
  return { ...decision, score, modelId: model.id };
}
