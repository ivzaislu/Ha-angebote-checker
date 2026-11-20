import { createHash } from "node:crypto";
import { EXACT_QUERIES } from "./exact.ts";
import { prepareTrainingData, type ArchiveSql, type TrainingSource } from "./offer-archive.ts";
import type { ProductExample } from "./product-net.ts";
import { productProbability, PRODUCT_ACCEPT_SCORE, PRODUCT_REJECT_SCORE } from "./product-net.ts";
import type { ProductModelPackage } from "./product-model-store.ts";
import { decideProduct } from "./product-policy.ts";
import { exampleKey, productGroup } from "./product-training.ts";

export const REVIEW_ARCHIVE_LIMIT = 10000;
export const REVIEW_SCORE_LIMIT = 600;
export type ReviewCard = {
  id: string;
  snapshotId: string;
  intent: string;
  name: string;
  category: string;
  description: string;
  reason: "conflict" | "uncertain" | "sample";
};
export function reviewedKey(row: ProductExample) {
  return createHash("sha256").update(exampleKey(row)).digest("hex");
}
function reviewable(row: TrainingSource, controls: Set<string>) {
  return (
    row.country === "de" &&
    row.name.trim().length >= 3 &&
    row.name.length <= 180 &&
    row.category.length <= 180 &&
    row.description.length <= 600 &&
    !controls.has(productGroup({ ...row, intent: "", positive: false, source: "rules" }))
  );
}
export function reviewCandidates(
  snapshots: TrainingSource[],
  reviewed: Set<string>,
  model: ProductModelPackage | null,
  controls: Set<string>,
): ReviewCard[] {
  const weak = prepareTrainingData(snapshots.filter((row) => reviewable(row, controls)));
  const seen = new Set<string>();
  const candidates = weak
    .flatMap((row) => {
      const example: ProductExample = { ...row, source: "rules" };
      const id = reviewedKey(example);
      if (reviewed.has(id) || seen.has(id)) return [];
      seen.add(id);
      return [{ row, example, id }];
    })
    .slice(0, REVIEW_SCORE_LIMIT)
    .map(({ row, example, id }) => {
      const decision = decideProduct(model, example);
      const score = model ? productProbability(model.net, example) : 0.5;
      const conflict = decision.fromBrain && decision.keep !== row.positive;
      const uncertain = score > PRODUCT_REJECT_SCORE && score < PRODUCT_ACCEPT_SCORE;
      const reason: ReviewCard["reason"] = conflict
        ? "conflict"
        : uncertain
          ? "uncertain"
          : "sample";
      return {
        card: {
          id,
          snapshotId: row.provenance.snapshotId,
          intent: row.intent,
          name: row.name,
          category: row.category,
          description: row.description,
          reason,
        },
        rank: conflict ? 0 : uncertain ? 1 : 2,
        distance: Math.abs(score - 0.5),
      };
    });
  return candidates
    .sort(
      (a, b) => a.rank - b.rank || a.distance - b.distance || a.card.id.localeCompare(b.card.id),
    )
    .slice(0, 20)
    .map((row) => row.card);
}
export async function reviewedCount(sql: ArchiveSql): Promise<number> {
  const [row] = await sql.query<{ count: number }>(
    "select count(*)::int as count from product_review_labels",
  );
  return row.count;
}
export async function loadReviewQueue(
  sql: ArchiveSql,
  model: ProductModelPackage | null,
  controls: Set<string>,
) {
  const snapshots =
    await sql.query<TrainingSource>(`select snapshot_id,country,offer_id,name,description,category,variant_key
    from offer_archive where country='de' order by observed_at desc,snapshot_id limit ${REVIEW_ARCHIVE_LIMIT}`);
  const existing = await sql.query<{ example_key: string }>(
    "select example_key from product_review_labels",
  );
  return {
    cards: reviewCandidates(
      snapshots,
      new Set(existing.map((row) => row.example_key)),
      model,
      controls,
    ),
    reviewedCount: existing.length,
    archiveSnapshotsRead: snapshots.length,
    archiveReadLimit: REVIEW_ARCHIVE_LIMIT,
  };
}
export type ReviewAnswer = {
  snapshotId: string;
  intent: string;
  positive: boolean;
  expectedPositive?: boolean;
};
export async function saveArchiveReview(
  sql: ArchiveSql,
  answer: ReviewAnswer,
  controls: Set<string>,
) {
  const [snapshot] = await sql.query<TrainingSource>(
    `select snapshot_id,country,offer_id,name,description,category,variant_key
    from offer_archive where snapshot_id=$1`,
    [answer.snapshotId],
  );
  if (
    !snapshot ||
    !reviewable(snapshot, controls) ||
    !EXACT_QUERIES.some((rule) => rule.query === answer.intent)
  )
    throw new Error("Этот пример недоступен для проверки. Загрузите очередь заново.");
  // Reconstruct the example from immutable server data; never accept edited text,
  // a client-supplied source, or control-set labels from the browser.
  const row: ProductExample = {
    intent: answer.intent,
    name: snapshot.name,
    category: snapshot.category,
    description: snapshot.description,
    positive: answer.positive,
    source: "human",
  };
  const id = reviewedKey(row);
  const saved = await sql.query(
    `insert into product_review_labels(example_key,intent,name,category,description,positive)
    values($1,$2,$3,$4,$5,$6) on conflict(example_key) do update
    set positive=excluded.positive,updated_at=now()
    where $7::boolean is not null and product_review_labels.positive=$7::boolean returning example_key`,
    [
      id,
      row.intent,
      row.name,
      row.category,
      row.description,
      row.positive,
      answer.expectedPositive ?? null,
    ],
  );
  if (!saved.length) {
    const [existing] = await sql.query<{ positive: boolean }>(
      "select positive from product_review_labels where example_key=$1",
      [id],
    );
    if (!existing || existing.positive !== answer.positive)
      throw new Error("Пример уже проверен в другой вкладке. Загрузите очередь заново.");
  }
  return { id, positive: answer.positive, reviewedCount: await reviewedCount(sql) };
}
