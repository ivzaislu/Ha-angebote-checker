import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import type { ArchiveSql } from "./offer-archive.ts";

// Coordinator and trainer hold shared session locks. Recovery needs an exclusive
// transaction lock, so neither living process can be reclaimed as interrupted.
export const TRAINING_LOCK = 73431025;
export type TrainingResult = {
  candidate: string;
  activated: boolean;
  trainCount: number;
  validationCount: number;
  testCount: number;
  reasons: string[];
  deployedControlAccuracy: number | null;
};
export type TrainingJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "rejected" | "failed";
  stage: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  result: TrainingResult | null;
  error: string | null;
};
export function trainingConfigured(token: string | undefined, database: string | undefined) {
  return Boolean(database?.trim() && token && token.length >= 24);
}
export function authorizeTraining(provided: string, expected: string | undefined) {
  if (!expected || expected.length < 24) throw new Error("Das Training ist auf dem Server nicht eingerichtet");
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(provided), hash(expected))) throw new Error("Ungültiger Inhaberschlüssel");
}
export async function latestTrainingJob(sql: ArchiveSql): Promise<TrainingJob | null> {
  const [job] = await sql.query<TrainingJob>(
    "select * from product_training_jobs order by created_at desc,id desc limit 1",
  );
  return job ?? null;
}
export async function createTrainingJob(
  sql: ArchiveSql,
): Promise<{ job: TrainingJob; created: boolean }> {
  const [created] = await sql.query<TrainingJob>(
    `insert into product_training_jobs(id,status) values ($1,'queued')
     on conflict do nothing returning *`,
    [randomUUID()],
  );
  if (created) return { job: created, created: true };
  const [job] = await sql.query<TrainingJob>(
    "select * from product_training_jobs where status in ('queued','running') limit 1",
  );
  // A job may have finished between INSERT and SELECT; retry the atomic insert.
  return job ? { job, created: false } : createTrainingJob(sql);
}
export async function recoverTrainingJobs(sql: ArchiveSql) {
  await sql.query(`update product_training_jobs set status='failed',stage='finished',
    error='Das Training wurde unterbrochen. Starten Sie es erneut.',finished_at=now(),updated_at=now()
    where status in ('queued','running') and updated_at < now()-interval '90 seconds'
      and pg_try_advisory_xact_lock(${TRAINING_LOCK})`);
}
export async function failTrainingJob(sql: ArchiveSql, id: string) {
  await sql.query(
    `update product_training_jobs set status='failed',stage='finished',
    error='Das Training konnte nicht abgeschlossen werden. Details stehen im Containerprotokoll.',
    updated_at=now(),finished_at=now() where id=$1 and status in ('queued','running')`,
    [id],
  );
}
/** Only release the small, typed summary; never publish process output or DB errors. */
export function parseTrainingResult(output: string): TrainingResult {
  const value = JSON.parse(output);
  if (
    !value ||
    typeof value.candidate !== "string" ||
    typeof value.activated !== "boolean" ||
    ![value.trainCount, value.validationCount, value.testCount].every(
      (n) => Number.isInteger(n) && n >= 0,
    ) ||
    !Array.isArray(value.reasons) ||
    !value.reasons.every((r: unknown) => typeof r === "string") ||
    !(
      value.deployedControlAccuracy === null ||
      (typeof value.deployedControlAccuracy === "number" &&
        value.deployedControlAccuracy >= 0 &&
        value.deployedControlAccuracy <= 1)
    )
  ) {
    throw new Error("Invalid training result");
  }
  return {
    candidate: value.candidate,
    activated: value.activated,
    trainCount: value.trainCount,
    validationCount: value.validationCount,
    testCount: value.testCount,
    reasons: value.reasons,
    deployedControlAccuracy: value.deployedControlAccuracy,
  };
}
