import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { getSql } from "@/lib/db";
import {
  authorizeTraining,
  trainingConfigured,
  recoverTrainingJobs,
  latestTrainingJob,
  createTrainingJob,
  failTrainingJob,
} from "./product-training-jobs.ts";

export async function trainingStatus() {
  const configured = trainingConfigured(process.env.TRAINING_ADMIN_TOKEN, process.env.DATABASE_URL);
  if (!process.env.DATABASE_URL?.trim()) return { configured, job: null };
  const sql = await getSql();
  await recoverTrainingJobs(sql);
  return { configured, job: await latestTrainingJob(sql) };
}
export async function startTraining(key: string) {
  authorizeTraining(key, process.env.TRAINING_ADMIN_TOKEN);
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Нужна постоянная база PostgreSQL");
  const sql = await getSql();
  await recoverTrainingJobs(sql);
  const { job, created } = await createTrainingJob(sql);
  if (created) {
    try {
      const env = { ...process.env };
      delete env.TRAINING_ADMIN_TOKEN;
      const child = spawn(
        process.execPath,
        [
          "--max-old-space-size=64",
          "--experimental-strip-types",
          resolve("scripts/product-training-worker.ts"),
          job.id,
        ],
        {
          cwd: process.cwd(),
          env,
          detached: true,
          stdio: ["ignore", "inherit", "inherit"],
        },
      );
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
    } catch (error) {
      await failTrainingJob(sql, job.id);
      console.error("Training worker failed to start", error);
      throw new Error("Не удалось запустить обучение");
    }
  }
  return { configured: true, job };
}
