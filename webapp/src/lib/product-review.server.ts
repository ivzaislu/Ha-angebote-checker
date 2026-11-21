import { getSql } from "@/lib/db";
import controls from "./product-benchmark.json";
import { productGroup } from "./product-training.ts";
import { authorizeTraining } from "./product-training-jobs.ts";
import { currentProductModel } from "./product-model.server.ts";
import {
  loadReviewQueue,
  saveArchiveReview,
  reportedReviewExamples,
  type ReviewAnswer,
} from "./product-review-queue.ts";
import { latestRejectedProductModel } from "./product-model-store.ts";

const controlNames = new Set(
  controls.map((row) => productGroup({ ...row, intent: "", positive: false, source: "curated" })),
);
function authorize(key: string) {
  authorizeTraining(key, process.env.TRAINING_ADMIN_TOKEN);
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Нужна постоянная база PostgreSQL");
}
export async function reviewQueue(key: string, mode: "active" | "rejected" = "active") {
  authorize(key);
  const sql = await getSql();
  const model =
    mode === "rejected" ? await latestRejectedProductModel(sql) : await currentProductModel();
  if (mode === "rejected" && !model) throw new Error("Отклонённых кандидатов с отчётом пока нет");
  const result = await loadReviewQueue(
    sql,
    model,
    controlNames,
    mode === "rejected"
      ? {
          inspectCandidate: true,
          onlyReportedConflicts: true,
          priorityExamples: reportedReviewExamples(model),
        }
      : {},
  );
  return {
    ...result,
    reviewModel: {
      mode,
      id: model?.id ?? null,
      featureVersion: model?.net.featureVersion ?? 2,
      reasons: mode === "rejected" ? (model?.report.reasons ?? []) : [],
    },
  };
}
export async function answerReview(key: string, answer: ReviewAnswer) {
  authorize(key);
  return saveArchiveReview(await getSql(), answer, controlNames);
}
