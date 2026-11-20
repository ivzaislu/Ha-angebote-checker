import { getSql } from "@/lib/db";
import controls from "./product-benchmark.json";
import { productGroup } from "./product-training.ts";
import { authorizeTraining } from "./product-training-jobs.ts";
import { currentProductModel } from "./product-model.server.ts";
import { loadReviewQueue, saveArchiveReview, type ReviewAnswer } from "./product-review-queue.ts";

const controlNames = new Set(
  controls.map((row) => productGroup({ ...row, intent: "", positive: false, source: "curated" })),
);
function authorize(key: string) {
  authorizeTraining(key, process.env.TRAINING_ADMIN_TOKEN);
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Нужна постоянная база PostgreSQL");
}
export async function reviewQueue(key: string) {
  authorize(key);
  return loadReviewQueue(await getSql(), await currentProductModel(), controlNames);
}
export async function answerReview(key: string, answer: ReviewAnswer) {
  authorize(key);
  return saveArchiveReview(await getSql(), answer, controlNames);
}
