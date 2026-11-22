import { productMatchingMode } from "./product-matching.ts";
import { getSql } from "@/lib/db";
import {
  activeProductModelId,
  readProductCandidate,
  type ProductModelPackage,
} from "./product-model-store.ts";
let cached: ProductModelPackage | null = null;
export async function currentProductModel(): Promise<ProductModelPackage | null> {
  const sql = await getSql();
  const id = await activeProductModelId(sql);
  if (!id) {
    cached = null;
    return null;
  }
  if (cached?.id !== id) cached = await readProductCandidate(sql, id);
  return cached;
}
export async function productModelStatus() {
  const model = await currentProductModel();
  const sql = await getSql();
  const [count] = await sql.query<{ count: number }>(
    "select count(*)::int as count from product_models",
  );
  return {
    matchingMode: productMatchingMode(process.env.PRODUCT_MATCHING_MODE),
    reviewedLabels: (await sql.query<{count:number}>("select count(*)::int as count from product_review_labels"))[0].count,
    active: model
      ? {
          id: model.id,
          version: model.net.version,
          featureVersion: model.net.featureVersion ?? 2,
          steps: model.net.steps,
          trainCount: model.report.trainCount,
          validationCount: model.report.validationCount,
          testCount: model.report.testCount,
          sources: model.report.sources,
          testAccuracy: model.report.test.accuracy,
          supportedIntents: model.report.supportedIntents,
        }
      : null,
    candidates: count.count,
  };
}
