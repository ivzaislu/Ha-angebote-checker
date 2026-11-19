import { createHash } from "node:crypto";
import {
  newProductNet,
  normalizedText,
  hashText,
  seededRandom,
  productFeatures,
  productTrainingStep,
  productProbability,
  binaryLoss,
  type ProductExample,
  type ProductNet,
} from "./product-net.ts";
import { offerFits } from "./exact.ts";

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
export type Metrics = {
  count: number;
  positive: number;
  negative: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number | null;
  balancedAccuracy: number | null;
  precision: number | null;
  recall: number | null;
  loss: number | null;
  brier: number | null;
  confidentCount: number;
  coverage: number;
  confidentErrors: number;
  accepted: number;
  acceptedPrecision: number | null;
  perIntent: Record<
    string,
    { count: number; correct: number; positive: number; tp: number; fp: number }
  >;
};
export function classificationMetrics(
  rows: ProductExample[],
  score: (row: ProductExample) => number,
): Metrics {
  let tp = 0,
    tn = 0,
    fp = 0,
    fn = 0,
    loss = 0,
    brier = 0,
    confidentCount = 0,
    confidentErrors = 0,
    accepted = 0,
    acceptedCorrect = 0;
  const perIntent: Metrics["perIntent"] = {};
  for (const row of rows) {
    const p = score(row);
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error("Invalid classifier probability");
    const predicted = p >= 0.5,
      correct = predicted === row.positive;
    if (predicted) {
      if (row.positive) tp++;
      else fp++;
    } else if (row.positive) fn++;
    else tn++;
    loss += binaryLoss(p, row.positive);
    brier += (p - Number(row.positive)) ** 2;
    if (p >= 0.9 || p <= 0.1) {
      confidentCount++;
      if (!correct) confidentErrors++;
    }
    if (p >= 0.9) {
      accepted++;
      if (row.positive) acceptedCorrect++;
    }
    const slot = perIntent[row.intent] ?? { count: 0, correct: 0, positive: 0, tp: 0, fp: 0 };
    slot.count++;
    slot.correct += Number(correct);
    slot.positive += Number(row.positive);
    slot.tp += Number(row.positive && predicted);
    slot.fp += Number(!row.positive && predicted);
    perIntent[row.intent] = slot;
  }
  const positive = tp + fn,
    negative = tn + fp;
  return {
    count: rows.length,
    positive,
    negative,
    tp,
    tn,
    fp,
    fn,
    accuracy: rows.length ? (tp + tn) / rows.length : null,
    balancedAccuracy: positive && negative ? (tp / positive + tn / negative) / 2 : null,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: positive ? tp / positive : null,
    loss: rows.length ? loss / rows.length : null,
    brier: rows.length ? brier / rows.length : null,
    confidentCount,
    coverage: rows.length ? confidentCount / rows.length : 0,
    confidentErrors,
    accepted,
    acceptedPrecision: accepted ? acceptedCorrect / accepted : null,
    perIntent,
  };
}
export type TrainingReport = {
  schemaVersion: 1;
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
export function qualityGate(
  validation: Metrics,
  test: Metrics,
  trainCount: number,
  champion?: Metrics,
): string[] {
  const reasons: string[] = [];
  if (trainCount < 100) reasons.push("Fewer than 100 training examples");
  if (validation.count < 40 || validation.positive < 10 || validation.negative < 10)
    reasons.push("Insufficient validation coverage/classes");
  if (test.count < 40 || test.positive < 10 || test.negative < 10)
    reasons.push("Insufficient authored regression coverage/classes");
  for (const [name, metric] of [
    ["validation", validation],
    ["test", test],
  ] as const) {
    if ((metric.accuracy ?? 0) < 0.9 || (metric.balancedAccuracy ?? 0) < 0.85)
      reasons.push(`${name}: classification quality below threshold`);
    if (
      (metric.acceptedPrecision ?? 0) < 0.95 ||
      metric.coverage < 0.15 ||
      metric.accepted < (name === "validation" ? 5 : 10)
    )
      reasons.push(`${name}: insufficient reliable confident decisions`);
  }
  if (
    champion &&
    ((test.accuracy ?? 0) < (champion.accuracy ?? 0) ||
      test.fp > champion.fp ||
      test.confidentErrors > champion.confidentErrors)
  )
    reasons.push("Regression compared with the active model on the authored control set");
  return reasons;
}
export function trainProductModel(
  dataset: Dataset,
  options: { epochs?: number; seed?: number; rate?: number; champion?: ProductNet } = {},
): { net: ProductNet; report: TrainingReport } {
  if (!dataset.train.length || !dataset.validation.length || !dataset.test.length)
    throw new Error("Train, validation and test subsets are required");
  const epochs = options.epochs ?? 40;
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 100)
    throw new Error("Epochs must be 1–100");
  const net = newProductNet(options.seed ?? 173),
    rand = seededRandom(options.seed ?? 173);
  const prepared = dataset.train.map((row) => ({ row, features: productFeatures(row) }));
  const positives = dataset.train.filter((row) => row.positive).length,
    negatives = dataset.train.length - positives;
  if (!positives || !negatives) throw new Error("Both training classes are required");
  let best = structuredClone(net),
    bestLoss = Infinity,
    bestEpoch = 0,
    stale = 0,
    ran = 0;
  for (let epoch = 1; epoch <= epochs; epoch++) {
    for (let i = prepared.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [prepared[i], prepared[j]] = [prepared[j], prepared[i]];
    }
    const rate = (options.rate ?? 0.03) * 0.96 ** (epoch - 1);
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
    const metric = classificationMetrics(dataset.validation, (row) => productProbability(net, row));
    if (metric.loss !== null && metric.loss < bestLoss - 0.0001) {
      bestLoss = metric.loss;
      best = structuredClone(net);
      bestEpoch = epoch;
      stale = 0;
    } else stale++;
    if (stale >= 6) break;
  }
  // The authored control set is scored only AFTER early stopping selected a model.
  const evaluate = (rows: ProductExample[]) =>
    classificationMetrics(rows, (row) => productProbability(best, row));
  const train = evaluate(dataset.train),
    validation = evaluate(dataset.validation),
    test = evaluate(dataset.test);
  const rules = classificationMetrics(dataset.test, (row) =>
    offerFits(row.intent, row.name, row.description, row.category) ? 1 : 0,
  );
  const champion = options.champion
    ? classificationMetrics(dataset.test, (row) => productProbability(options.champion!, row))
    : undefined;
  const reasons = qualityGate(validation, test, dataset.train.length, champion ?? rules);
  const supportedIntents = [
    ...new Set(dataset.train.filter((row) => row.positive).map((row) => row.intent)),
  ]
    .filter((intent) => {
      const val = validation.perIntent[intent],
        control = test.perIntent[intent];
      return (
        val?.positive > 0 &&
        val.tp / val.positive >= 0.5 &&
        control?.positive > 0 &&
        control.tp / control.positive >= 0.5 &&
        control.fp === 0
      );
    })
    .sort();
  if (!supportedIntents.length)
    reasons.push("No intent has sufficient validated positive coverage");
  const vocabulary = [
    ...new Set(
      dataset.train
        .flatMap((row) =>
          normalizedText(`${row.name} ${row.category} ${row.description}`).split(" "),
        )
        .filter((word) => word.length >= 3),
    ),
  ].sort();
  return {
    net: best,
    report: {
      schemaVersion: 1,
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
      epochs: ran,
      bestEpoch,
      train,
      validation,
      test,
      rules,
      eligible: reasons.length === 0,
      reasons,
      labelWarning:
        "Rules labels are weak supervision; the authored control set is not an independent real-world accuracy estimate. Probabilities are not calibrated.",
    },
  };
}
