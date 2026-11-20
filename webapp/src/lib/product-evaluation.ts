import { classificationMetrics, type Metrics } from "./product-metrics.ts";
import {
  PRODUCT_ACCEPT_SCORE,
  PRODUCT_REJECT_SCORE,
  type ProductNet,
  type ProductExample,
} from "./product-net.ts";
import { decideWithProductPolicy, type ProductPolicy } from "./product-policy.ts";

export type DecisionMetrics = Pick<
  Metrics,
  | "count"
  | "positive"
  | "negative"
  | "tp"
  | "tn"
  | "fp"
  | "fn"
  | "accuracy"
  | "balancedAccuracy"
  | "precision"
  | "recall"
  | "perIntent"
>;
export type DeploymentMetrics = { all: DecisionMetrics; neural: Metrics; neuralCoverage: number };
export type DeploymentEvaluation = {
  version: 2;
  thresholds: { accept: number; reject: number };
  scopeSource: "training-and-trusted-validation";
  supportedIntents: string[];
  trustedValidation: DeploymentMetrics;
  control: DeploymentMetrics;
  weakValidation: DeploymentMetrics;
  baselineValidation: DeploymentMetrics;
  baselineControl: DeploymentMetrics;
  baselineName: "rules baseline" | "active model";
  weakConflicts: {
    intent: string;
    name: string;
    category: string;
    description: string;
    positive: boolean;
    modelDecision: boolean;
    modelScore: number | null;
    source: "rules";
  }[];
};
export function evaluateProductPolicy(
  policy: ProductPolicy | null,
  rows: ProductExample[],
): DeploymentMetrics {
  const decisions = rows.map((row) => decideWithProductPolicy(policy, row));
  const byRow = new Map(rows.map((row, index) => [row, decisions[index]]));
  const neuralRows = rows.filter((row) => byRow.get(row)!.fromBrain);
  const {
    count,
    positive,
    negative,
    tp,
    tn,
    fp,
    fn,
    accuracy,
    balancedAccuracy,
    precision,
    recall,
    perIntent,
  } = classificationMetrics(rows, (row) => (byRow.get(row)!.keep ? 1 : 0));
  return {
    all: {
      count,
      positive,
      negative,
      tp,
      tn,
      fp,
      fn,
      accuracy,
      balancedAccuracy,
      precision,
      recall,
      perIntent,
    },
    neural: classificationMetrics(neuralRows, (row) => byRow.get(row)!.score!),
    neuralCoverage: rows.length ? neuralRows.length / rows.length : 0,
  };
}
/** Scope selection uses validation only. Control labels cannot switch off difficult intents. */
export function validatedProductScope(
  net: ProductNet,
  train: ProductExample[],
  trustedValidation: ProductExample[],
  vocabulary: string[],
  declaredIntents: string[],
): string[] {
  return [...new Set(train.filter((row) => row.positive).map((row) => row.intent))]
    .filter((intent) => {
      if (!declaredIntents.includes(intent)) return false;
      const rows = trustedValidation.filter((row) => row.intent === intent);
      if (!rows.some((row) => row.positive) || !rows.some((row) => !row.positive)) return false;
      const provisional = { id: "evaluation", net, supportedIntents: [intent], vocabulary };
      const metrics = evaluateProductPolicy(provisional, rows);
      return metrics.neural.accepted >= 1 && metrics.neural.confidentErrors === 0;
    })
    .sort();
}
export function deploymentEvaluation(
  net: ProductNet,
  supportedIntents: string[],
  vocabulary: string[],
  validation: ProductExample[],
  control: ProductExample[],
  champion: ProductPolicy | null,
): DeploymentEvaluation {
  const policy = { id: "candidate", net, supportedIntents, vocabulary };
  const trusted = validation.filter((row) => row.source !== "rules"),
    weak = validation.filter((row) => row.source === "rules");
  return {
    version: 2,
    thresholds: { accept: PRODUCT_ACCEPT_SCORE, reject: PRODUCT_REJECT_SCORE },
    scopeSource: "training-and-trusted-validation",
    supportedIntents,
    trustedValidation: evaluateProductPolicy(policy, trusted),
    control: evaluateProductPolicy(policy, control),
    weakValidation: evaluateProductPolicy(policy, weak),
    baselineValidation: evaluateProductPolicy(champion, trusted),
    baselineControl: evaluateProductPolicy(champion, control),
    baselineName: champion ? "active model" : "rules baseline",
    weakConflicts: weak
      .flatMap((row) => {
        const decision = decideWithProductPolicy(policy, row);
        return decision.fromBrain && decision.keep !== row.positive
          ? [
              {
                ...row,
                source: "rules" as const,
                modelDecision: decision.keep,
                modelScore: decision.score,
              },
            ]
          : [];
      })
      .slice(0, 20),
  };
}
export function qualityGate(evaluation: DeploymentEvaluation, trainCount: number): string[] {
  const reasons: string[] = [];
  if (trainCount < 100) reasons.push("Fewer than 100 training examples");
  for (const [name, metrics, acceptedMin] of [
    ["trusted validation", evaluation.trustedValidation, 5],
    ["authored control", evaluation.control, 10],
  ] as const) {
    if (metrics.all.count < 40 || metrics.all.positive < 10 || metrics.all.negative < 10)
      reasons.push(`${name}: insufficient labelled coverage/classes`);
    if ((metrics.all.accuracy ?? 0) < 0.9 || (metrics.all.balancedAccuracy ?? 0) < 0.85)
      reasons.push(`${name}: deployed classification quality below threshold`);
    if ((metrics.neural.acceptedPrecision ?? 0) < 0.95)
      reasons.push(
        `${name}: deployed neural accepted precision ${metrics.neural.acceptedPrecision ?? "undefined"} below 0.95`,
      );
    if (metrics.neural.accepted < acceptedMin)
      reasons.push(
        `${name}: only ${metrics.neural.accepted} neural acceptances; need ${acceptedMin}`,
      );
    if (metrics.neuralCoverage < 0.15)
      reasons.push(`${name}: deployed neural coverage ${metrics.neuralCoverage} below 0.15`);
  }
  for (const intent of evaluation.supportedIntents) {
    const slot = evaluation.control.all.perIntent[intent];
    if (!slot || slot.positive < 1 || slot.count - slot.positive < 1)
      reasons.push(`control: missing positive/negative coverage for enabled intent ${intent}`);
  }
  const current = evaluation.baselineControl.all,
    next = evaluation.control.all;
  if ((next.accuracy ?? 0) < (current.accuracy ?? 0))
    reasons.push(`control: deployed accuracy regressed against ${evaluation.baselineName}`);
  if (next.fp > current.fp)
    reasons.push(
      `control: deployed false matches ${next.fp} exceed ${evaluation.baselineName} ${current.fp}`,
    );
  if (next.fn > current.fn)
    reasons.push(
      `control: deployed missed matches ${next.fn} exceed ${evaluation.baselineName} ${current.fn}`,
    );
  // Automatic labels are not ground truth, but unresolved high-score conflicts
  // still block release and must be inspected instead of silently discarded.
  const weak = evaluation.weakValidation.neural;
  if (weak.accepted > 0 && (weak.acceptedPrecision ?? 0) < 0.95)
    reasons.push(
      `weak validation: deployed neural accepts disagree with automatic labels (precision ${weak.acceptedPrecision}); review required`,
    );
  if (weak.positive > 0 && (weak.recall ?? 0) < 0.85)
    reasons.push(
      `weak validation: deployed neural rejects disagree with automatic positive labels (recall ${weak.recall}); review required`,
    );
  return reasons;
}
