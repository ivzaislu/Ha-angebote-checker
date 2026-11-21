import { createHash } from "node:crypto";
import { EXACT_QUERIES } from "./exact.ts";
import { prepareTrainingData, type ArchiveSql, type TrainingSource } from "./offer-archive.ts";
import type { ProductExample } from "./product-net.ts";
import { productProbability, PRODUCT_ACCEPT_SCORE, PRODUCT_REJECT_SCORE } from "./product-net.ts";
import type { ProductModelPackage } from "./product-model-store.ts";
import { decideProduct, decideWithProductPolicy, policyForModel } from "./product-policy.ts";
import { exampleKey, productGroup } from "./product-training.ts";
import { reviewPresentation, type ReviewPresentationSource } from "./review-presentation.ts";
import {
  incompatibleCategory,
  productCategory,
  distantReviewCategory,
} from "./product-category.ts";

type ReviewSnapshot = TrainingSource &
  Partial<Pick<ReviewPresentationSource, "offer_name" | "catalog_name">>;

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
  displayName: string;
  otherNames: string[];
  imageUrl: string | null;
  shortName: boolean;
  categoryGroup: string;
  reportedConflict: boolean;
};
export type ReviewOptions = {
  inspectCandidate?: boolean;
  onlyReportedConflicts?: boolean;
  priorityExamples?: ProductExample[];
};
export function reportedReviewExamples(model: ProductModelPackage | null): ProductExample[] {
  const rows = model?.report.deployment?.weakConflicts;
  if (!Array.isArray(rows)) return [];
  return rows
    .slice(0, 20)
    .filter(
      (row) =>
        typeof row.intent === "string" &&
        row.intent.length <= 80 &&
        EXACT_QUERIES.some((rule) => rule.query === row.intent) &&
        typeof row.name === "string" &&
        row.name.length <= 180 &&
        typeof row.category === "string" &&
        row.category.length <= 180 &&
        typeof row.description === "string" &&
        row.description.length <= 600 &&
        typeof row.positive === "boolean",
    )
    .map((row) => ({ ...row, source: "rules" }));
}
function textKey(row: ProductExample) {
  return exampleKey({ ...row, intent: "" });
}
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
  snapshots: ReviewSnapshot[],
  reviewed: Set<string>,
  model: ProductModelPackage | null,
  controls: Set<string>,
  options: ReviewOptions = {},
): ReviewCard[] {
  const eligibleSnapshots = snapshots.filter((row) => reviewable(row, controls));
  const weak = prepareTrainingData(eligibleSnapshots);
  const originals = new Map(snapshots.map((row) => [row.snapshot_id, row]));
  const byText = new Map<string, ReviewSnapshot>();
  for (const snapshot of eligibleSnapshots) {
    const key = textKey({ ...snapshot, intent: "", positive: false, source: "rules" });
    if (!byText.has(key)) byText.set(key, snapshot);
  }
  const seen = new Set<string>();
  const priority = (options.priorityExamples ?? []).flatMap((example) => {
    const snapshot = byText.get(textKey(example));
    const id = reviewedKey(example);
    if (!snapshot || reviewed.has(id) || seen.has(id)) return [];
    seen.add(id);
    return [
      {
        row: { ...example, provenance: { snapshotId: snapshot.snapshot_id } },
        example,
        id,
        distant: false,
        reported: true,
      },
    ];
  });
  const available = (options.onlyReportedConflicts ? [] : weak).flatMap((row) => {
    if (incompatibleCategory(row.intent, row.category)) return [];
    const example: ProductExample = { ...row, source: "rules" };
    const id = reviewedKey(example);
    if (reviewed.has(id) || seen.has(id)) return [];
    seen.add(id);
    return [
      {
        row,
        example,
        id,
        distant: !row.positive && distantReviewCategory(row.intent, row.category),
        reported: false,
      },
    ];
  });
  const budget = REVIEW_SCORE_LIMIT - priority.length;
  const near = available.filter((row) => !row.distant).slice(0, Math.max(0, budget - 100));
  const far = available.filter((row) => row.distant).slice(0, budget - near.length);
  const candidates = [...priority, ...near, ...far].flatMap(
    ({ row, example, id, distant, reported }) => {
      // Review may inspect failed weights; search still uses decideProduct and only
      // qualified active models. No training or activation occurs here.
      const decision =
        options.inspectCandidate && model
          ? decideWithProductPolicy(policyForModel(model), example)
          : decideProduct(model, example);
      const score = model ? productProbability(model.net, example) : 0.5;
      const conflict = decision.fromBrain && decision.keep !== row.positive;
      if (distant && !conflict) return [];
      const uncertain = score > PRODUCT_REJECT_SCORE && score < PRODUCT_ACCEPT_SCORE;
      const reason: ReviewCard["reason"] =
        reported || conflict ? "conflict" : uncertain ? "uncertain" : "sample";
      return [
        {
          card: {
            id,
            snapshotId: row.provenance.snapshotId,
            intent: row.intent,
            name: row.name,
            category: row.category,
            description: row.description,
            reason,
            categoryGroup: productCategory(row.category).label,
            reportedConflict: reported,
            ...reviewPresentation(originals.get(row.provenance.snapshotId)!),
          },
          rank: reported ? -1 : conflict ? 0 : uncertain ? 1 : 2,
          distance: Math.abs(score - 0.5),
        },
      ];
    },
  );
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
  options: ReviewOptions = {},
) {
  const snapshots = options.onlyReportedConflicts
    ? []
    : await sql.query<ReviewSnapshot>(`select snapshot_id,country,offer_id,name,description,category,variant_key,
    case when jsonb_typeof(raw_payload->'name')='string' then raw_payload->>'name' end as offer_name,
    case when jsonb_typeof(raw_payload->'product'->'name')='string' then raw_payload->'product'->>'name' end as catalog_name
    from offer_archive where country='de' order by observed_at desc,snapshot_id limit ${REVIEW_ARCHIVE_LIMIT}`);
  const priorities = options.priorityExamples ?? [];
  const prioritySnapshots = priorities.length
    ? await sql.query<ReviewSnapshot>(
        `with wanted as (
    select name,category,description from jsonb_to_recordset($1::jsonb)
      as x(name text,category text,description text)
  ) select distinct on (a.name,a.category,a.description) a.snapshot_id,a.country,a.offer_id,a.name,a.description,a.category,a.variant_key,
    case when jsonb_typeof(a.raw_payload->'name')='string' then a.raw_payload->>'name' end as offer_name,
    case when jsonb_typeof(a.raw_payload->'product'->'name')='string' then a.raw_payload->'product'->>'name' end as catalog_name
    from offer_archive a join wanted w on a.name=w.name and a.category=w.category and a.description=w.description
    where a.country='de' order by a.name,a.category,a.description,a.observed_at desc,a.snapshot_id`,
        [
          JSON.stringify(
            priorities.map((row) => ({
              name: row.name,
              category: row.category,
              description: row.description,
            })),
          ),
        ],
      )
    : [];
  const existing = await sql.query<{ example_key: string }>(
    "select example_key from product_review_labels",
  );
  const reviewed = new Set(existing.map((row) => row.example_key));
  const combined = [
    ...new Map([...prioritySnapshots, ...snapshots].map((row) => [row.snapshot_id, row])).values(),
  ];
  const availableText = new Set(
    combined
      .filter((row) => reviewable(row, controls))
      .map((row) => textKey({ ...row, intent: "", positive: false, source: "rules" })),
  );
  const uniquePriorities = [...new Map(priorities.map((row) => [reviewedKey(row), row])).entries()];
  return {
    cards: reviewCandidates(combined, reviewed, model, controls, options),
    reportedConflicts: uniquePriorities.length,
    pendingConflicts: uniquePriorities.filter(
      ([key, row]) => !reviewed.has(key) && availableText.has(textKey(row)),
    ).length,
    unavailableConflicts: uniquePriorities.filter(
      ([key, row]) => !reviewed.has(key) && !availableText.has(textKey(row)),
    ).length,
    reviewedCount: existing.length,
    archiveSnapshotsRead: snapshots.length,
    archiveReadLimit: REVIEW_ARCHIVE_LIMIT,
    conflictSnapshotsRead: prioritySnapshots.length,
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
