import { spawn } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
import {
  TRAINING_LOCK,
  failTrainingJob,
  parseTrainingResult,
} from "../src/lib/product-training-jobs.ts";

const id = process.argv[2];
if (!id || !process.env.DATABASE_URL) throw new Error("Training job and PostgreSQL required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const sql = {
  query: async <T>(text: string, params?: unknown[]): Promise<T[]> =>
    (await pool.query(text, params)).rows as T[],
};
const lock = await pool.connect();
let timer: ReturnType<typeof setInterval> | undefined;
let child: ReturnType<typeof spawn> | undefined;
let locked = false;
let ownsJob = false;
let stopped = false;
const stop = () => {
  stopped = true;
  child?.kill("SIGTERM");
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
pool.on("error", stop);
lock.on("error", stop);
try {
  locked = (await lock.query("select pg_try_advisory_lock_shared($1) as locked", [TRAINING_LOCK])).rows[0]
    .locked;
  if (!locked) throw new Error("Another training worker holds the lock");
  const started = await sql.query(
    `update product_training_jobs set status='running',stage='preparing',
    updated_at=now() where id=$1 and status='queued' returning id`,
    [id],
  );
  if (!started.length) throw new Error("Training job is no longer queued");
  ownsJob = true;
  if (stopped) throw new Error("Training was stopped before launch");
  child = spawn(
    process.execPath,
    [
      "--max-old-space-size=192",
      "--experimental-strip-types",
      resolve("scripts/product-model.ts"),
      "train",
      "--activate-if-qualified",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TRAINING_JOB_ID: id },
    },
  );
  let output = "",
    stderr = "",
    stage = "preparing";
  child.stdout!.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (output.length > 512_000) {
      stopped = true;
      child?.kill("SIGKILL");
    }
  });
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-16_000);
    const stages = [...stderr.matchAll(/PRODUCT_TRAINING_STAGE=(preparing|training|checking)/g)];
    if (stages.length) stage = stages.at(-1)![1];
  });
  timer = setInterval(() => {
    void lock
      .query("select 1")
      .then(() =>
        sql.query(
          "update product_training_jobs set stage=$2,updated_at=now() where id=$1 and status='running'",
          [id, stage],
        ),
      )
      .catch(stop);
  }, 5000);
  const timeout = setTimeout(() => {
    stopped = true;
    child?.kill("SIGKILL");
  }, 30 * 60_000);
  let code: number | null;
  try {
    code = await new Promise<number | null>((resolve, reject) => {
      child!.once("error", reject);
      child!.once("close", resolve);
    });
  } finally {
    clearTimeout(timeout);
  }
  if (stopped || (code !== 0 && code !== 2))
    throw new Error(`Training failed (${code}): ${stderr}`);
  const result = parseTrainingResult(output);
  if (result.activated !== (code === 0))
    throw new Error("Training exit status does not match result");
  await sql.query(
    `update product_training_jobs set status=$2,stage='finished',result=$3::jsonb,
    updated_at=now(),finished_at=now() where id=$1 and status='running'`,
    [id, result.activated ? "succeeded" : "rejected", JSON.stringify(result)],
  );
} catch (error) {
  child?.kill("SIGKILL");
  // Detailed diagnostics stay inside the container, never in public job status.
  console.error("Training job failed", id, error);
  if (ownsJob) await failTrainingJob(sql, id);
  process.exitCode = 1;
} finally {
  if (timer) clearInterval(timer);
  if (locked) await lock.query("select pg_advisory_unlock_shared($1)", [TRAINING_LOCK]).catch(() => {});
  lock.release();
  await pool.end();
}
