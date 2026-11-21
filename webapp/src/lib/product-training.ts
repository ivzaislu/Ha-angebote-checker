import { createHash } from "node:crypto";
import {
  newProductNet,
  validProductNet,
  normalizedText,
  hashText,
  seededRandom,
  productFeatures,
  productTrainingStep,
  productProbability,
  type ProductExample,
  type ProductNet,
} from "./product-net.ts";
import { classificationMetrics, type Metrics } from "./product-metrics.ts";
import {
  deploymentEvaluation,
  validatedProductScope,
  qualityGate,
  type DeploymentEvaluation,
} from "./product-evaluation.ts";
import { policyForModel, decideWithProductPolicy } from "./product-policy.ts";
import type { ProductModelPackage } from "./product-model-store.ts";
export { qualityGate } from "./product-evaluation.ts";
export { classificationMetrics, type Metrics } from "./product-metrics.ts";

export function exampleKey(row: ProductExample): string {
  return JSON.stringify([
    normalizedText(row.intent).slice(0, 80),
    normalizedText(row.name).slice(0, 180),
    normalizedText(row.category).slice(0, 180),
    normalizedText(row.description).slice(0, 600),
  ]);
}
export function productGroup(row: ProductExample): string {
  return normalizedText(row.name).slice(0, 180);
}
export type Dataset = {
  train: ProductExample[];
  validation: ProductExample[];
  test: ProductExample[];
  conflicts: number;
  fingerprint: string;
  sources: Record<string, number>;
};
export function prepareProductDataset(rows: ProductExample[], test: ProductExample[]): Dataset {
  const heldOut = new Set(test.map(productGroup));
  const unique = new Map<string, ProductExample>();
  const conflicts = new Set<string>();
  const priority = { rules: 0, curated: 1, human: 2 };
  for (const row of rows) {
    if (!row.intent.trim() || row.name.trim().length < 3 || heldOut.has(productGroup(row)))
      continue;
    const key = exampleKey(row),
      previous = unique.get(key);
    if (
      previous &&
      previous.positive !== row.positive &&
      priority[previous.source] === priority[row.source]
    ) {
      conflicts.add(key);
      continue;
    }
    if (!previous || priority[row.source] > priority[previous.source]) {
      unique.set(key, row);
      conflicts.delete(key);
    }
  }
  const train: ProductExample[] = [],
    validation: ProductExample[] = [],
    sources: Record<string, number> = {};
  for (const [key, row] of [...unique].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (conflicts.has(key)) continue;
    sources[row.source] = (sources[row.source] ?? 0) + 1;
    (hashText(productGroup(row)) % 5 === 0 ? validation : train).push(row);
  }
  const signature = [...train, ...validation].map((row) => [
    exampleKey(row),
    row.positive,
    row.source,
  ]);
  return {
    train,
    validation,
    test,
    conflicts: conflicts.size,
    sources,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          training: signature,
          control: test.map((row) => [exampleKey(row), row.positive, row.source]),
        }),
      )
      .digest("hex"),
  };
}
export type TrainingLearning = {
  mode: "warm-start" | "from-scratch";
  parentId: string | null;
  rate: number;
  initialValidationLoss: number;
  bestValidationLoss: number;
  weightsUpdated: boolean;
};
export type TrainingReport = {
  learning?: TrainingLearning;
  featureVersion?: 2 | 3;
  schemaVersion: 1 | 2;
  deployment?: DeploymentEvaluation;
  trustedValidation?: Metrics;
  weakValidation?: Metrics;
  controlFingerprint: string;
  supportedIntents: string[];
  vocabulary: string[];
  datasetFingerprint: string;
  trainCount: number;
  validationCount: number;
  testCount: number;
  sources: Record<string, number>;
  conflicts: number;
  epochs: number;
  bestEpoch: number;
  train: Metrics;
  validation: Metrics;
  test: Metrics;
  rules: Metrics;
  eligible: boolean;
  reasons: string[];
  labelWarning: string;
};
export function trainProductModel(
  dataset: Dataset,
  options: { epochs?: number; seed?: number; rate?: number; champion?: ProductModelPackage;
    initialization?: {id:string;net:ProductNet} } = {},
): { net: ProductNet; report: TrainingReport } {
  if (!dataset.train.length || !dataset.validation.length || !dataset.test.length)
    throw new Error("Train, validation and test subsets are required");
  const trustedValidation = dataset.validation.filter((row) => row.source !== "rules");
  if (!trustedValidation.length) throw new Error("Trusted validation labels are required");
  const epochs = options.epochs ?? 40;
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 100)
    throw new Error("Epochs must be 1–100");
  // Require compatible features; production continuation uses qualified active weights.
  // Offline curriculum pretraining may provide a reference independently of its
  // release-control score. This never grants eligibility or changes release gates.
  if(options.initialization && (!validProductNet(options.initialization.net) || options.initialization.net.featureVersion!==3))
    throw new Error("Pretrained initialization requires valid feature-schema-3 weights");
  const parent = options.initialization ?? (options.champion?.report.eligible ? options.champion : undefined);
  const warmStart = Boolean(parent && validProductNet(parent.net) && parent.net.featureVersion === 3);
  const net = warmStart ? structuredClone(parent!.net) : newProductNet(options.seed ?? 173);
  const rand = seededRandom(options.seed ?? 173);
  net.featureVersion = 3;
  const initialRate = options.rate ?? (warmStart ? 0.005 : 0.03);
  if (!Number.isFinite(initialRate) || initialRate <= 0 || initialRate > 1)
    throw new Error("Learning rate must be greater than 0 and at most 1");
  const initialValidationLoss = classificationMetrics(trustedValidation, row => productProbability(net, row)).loss!;
  const prepared = dataset.train.map((row) => ({ row, features: productFeatures(row, 3) }));
  const positives = dataset.train.filter((row) => row.positive).length,
    negatives = dataset.train.length - positives;
  if (!positives || !negatives) throw new Error("Both training classes are required");
  let best = structuredClone(net),
    bestLoss = warmStart ? initialValidationLoss : Infinity,
    bestEpoch = 0,
    stale = 0,
    ran = 0;
  for (let epoch = 1; epoch <= epochs; epoch++) {
    for (let i = prepared.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [prepared[i], prepared[j]] = [prepared[j], prepared[i]];
    }
    const rate = initialRate * 0.96 ** (epoch - 1);
    for (const { row, features } of prepared) {
      const classWeight = Math.min(
        5,
        dataset.train.length / (2 * (row.positive ? positives : negatives)),
      );
      productTrainingStep(
        net,
        features,
        row.positive,
        rate,
        classWeight * (row.source === "rules" ? 0.35 : 1),
      );
    }
    ran = epoch;
    const metric = classificationMetrics(trustedValidation, (row) => productProbability(net, row));
    if (metric.loss !== null && metric.loss < bestLoss - 0.0001) {
      bestLoss = metric.loss;
      best = structuredClone(net);
      bestEpoch = epoch;
      stale = 0;
    } else stale++;
    if (stale >= 6) break;
  }
  return {
    net: best,
    report: {
      ...evaluateTrainedProduct(best, dataset, { epochs: ran, bestEpoch }, options.champion),
      learning: {
        mode: warmStart ? "warm-start" : "from-scratch",
        parentId: warmStart ? parent!.id : null,
        rate: initialRate,
        initialValidationLoss,
        bestValidationLoss: bestLoss,
        // Epoch zero can win on trusted validation. Do not call that an improvement.
        weightsUpdated: bestEpoch > 0,
      },
    },
  };
}

/** Evaluate immutable weights with the same selective policy deployed by the app. */
export function evaluateTrainedProduct(
  net: ProductNet,
  dataset: Dataset,
  meta: { epochs: number; bestEpoch: number },
  champion?: ProductModelPackage,
): TrainingReport {
  const evaluate = (rows: ProductExample[]) =>
    classificationMetrics(rows, (row) => productProbability(net, row));
  const train = evaluate(dataset.train),
    validation = evaluate(dataset.validation),
    test = evaluate(dataset.test);
  const trustedValidation = evaluate(dataset.validation.filter((row) => row.source !== "rules"));
  const weakValidation = evaluate(dataset.validation.filter((row) => row.source === "rules"));
  const vocabulary = [
    ...new Set(
      dataset.train
        .flatMap((row) =>
          normalizedText(`${row.name} ${row.category} ${row.description}`).split(" "),
        )
        .filter((word) => word.length >= 3),
    ),
  ].sort();
  // Never inspect control labels while selecting supported intents.
  const supportedIntents = validatedProductScope(
    net,
    dataset.train,
    dataset.validation.filter((row) => row.source !== "rules"),
    vocabulary,
    [...new Set(dataset.test.map((row) => row.intent))],
  );
  const deployment = deploymentEvaluation(
    net,
    supportedIntents,
    vocabulary,
    dataset.validation,
    dataset.test,
    champion ? policyForModel(champion) : null,
  );
  const rules = classificationMetrics(dataset.test, (row) =>
    decideWithProductPolicy(null, row).keep ? 1 : 0,
  );
  const reasons = qualityGate(deployment, dataset.train.length);
  if (!supportedIntents.length) reasons.push("No intent has validated reliable neural decisions");
  return {
    schemaVersion: 2,
    featureVersion: net.featureVersion ?? 2,
    deployment,
    trustedValidation,
    weakValidation,
    controlFingerprint: createHash("sha256")
      .update(JSON.stringify(dataset.test.map((row) => [exampleKey(row), row.positive])))
      .digest("hex"),
    supportedIntents,
    vocabulary,
    datasetFingerprint: dataset.fingerprint,
    trainCount: dataset.train.length,
    validationCount: dataset.validation.length,
    testCount: dataset.test.length,
    sources: dataset.sources,
    conflicts: dataset.conflicts,
    epochs: meta.epochs,
    bestEpoch: meta.bestEpoch,
    train,
    validation,
    test,
    rules,
    eligible: reasons.length === 0,
    reasons,
    labelWarning:
      "Raw network metrics use a 0.5 threshold and are diagnostic. Release checks measure the deployed selective policy. Rule-label agreement is not ground truth; unresolved deployed conflicts still require review. Authored controls are not independent real-world accuracy estimates. Scores are not calibrated probabilities.",
  };
}
