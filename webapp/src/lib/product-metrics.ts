import {
  binaryLoss,
  PRODUCT_ACCEPT_SCORE,
  PRODUCT_REJECT_SCORE,
  type ProductExample,
} from "./product-net.ts";
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
  const perIntent: Metrics["perIntent"] = Object.create(null);
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
    if (p >= PRODUCT_ACCEPT_SCORE || p <= PRODUCT_REJECT_SCORE) {
      confidentCount++;
      if (!correct) confidentErrors++;
    }
    if (p >= PRODUCT_ACCEPT_SCORE) {
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
