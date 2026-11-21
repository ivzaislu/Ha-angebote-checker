import { createHash } from "node:crypto";
import type { ProductModelPackage } from "./product-model-store.ts";
import type { ProductExample } from "./product-net.ts";
import { exampleKey } from "./product-training.ts";
import { decideWithProductPolicy, policyForModel } from "./product-policy.ts";

/** Read-only release diagnostics. These examples must never enter the review/training queue. */
export function inspectControlFailures(model: ProductModelPackage, rows: ProductExample[]) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(rows.map(row => [exampleKey(row), row.positive])))
    .digest("hex");
  if (fingerprint !== model.report.controlFingerprint)
    return { available: false, total: 0, truncated: false, errors: [] };
  const policy = policyForModel(model);
  const errors = rows.flatMap(row => {
    const decision = decideWithProductPolicy(policy, row);
    return decision.keep === row.positive ? [] : [{
      intent: row.intent, name: row.name, category: row.category,
      description: row.description, expected: row.positive, actual: decision.keep,
      fromBrain: decision.fromBrain,
    }];
  });
  return { available: true, total: errors.length, truncated: errors.length > 20, errors: errors.slice(0, 20) };
}
