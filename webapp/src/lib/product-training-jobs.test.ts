import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  authorizeTraining,
  trainingConfigured,
  createTrainingJob,
  latestTrainingJob,
  failTrainingJob,
  parseTrainingResult,
} from "./product-training-jobs.ts";

test("training requires a configured owner key and persistent database", () => {
  const token = "test-only-owner-key-123456789";
  assert.equal(trainingConfigured(undefined, "postgres://db"), false);
  assert.equal(trainingConfigured("short", "postgres://db"), false);
  assert.equal(trainingConfigured(token, undefined), false);
  assert.equal(trainingConfigured(token, "postgres://db"), true);
  assert.throws(() => authorizeTraining("", token), /Ungültiger/);
  assert.throws(() => authorizeTraining("wrong", token), /Ungültiger/);
  assert.throws(() => authorizeTraining(token, undefined), /nicht eingerichtet/);
  assert.doesNotThrow(() => authorizeTraining(token, token));
});

test("concurrent clicks share one durable job; completion permits another job", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL("../../migrations/0005_product_training_jobs.sql", import.meta.url),
        "utf8",
      ),
    );
    const sql = {
      query: async <T>(text: string, params?: unknown[]) => (await db.query<T>(text, params)).rows,
    };
    const jobs = await Promise.all(Array.from({ length: 8 }, () => createTrainingJob(sql)));
    assert.equal(jobs.filter((j) => j.created).length, 1);
    assert.equal(new Set(jobs.map((j) => j.job.id)).size, 1);
    const id = jobs[0].job.id;
    assert.equal((await latestTrainingJob(sql))?.id, id);
    await failTrainingJob(sql, id);
    assert.equal((await latestTrainingJob(sql))?.status, "failed");
    assert.ok((await latestTrainingJob(sql))?.finished_at);
    const next = await createTrainingJob(sql);
    assert.equal(next.created, true);
    assert.notEqual(next.job.id, id);
    await sql.query(
      "update product_training_jobs set status='rejected',stage='finished' where id=$1",
      [next.job.id],
    );
    // A rejected quality gate is a finished job, not a permanently held queue.
    assert.equal((await createTrainingJob(sql)).created, true);
    await failTrainingJob(sql, next.job.id);
    const [unchanged] = await sql.query<{ status: string }>(
      "select status from product_training_jobs where id=$1",
      [next.job.id],
    );
    assert.equal(unchanged.status, "rejected");
  } finally {
    await db.close();
  }
});

test("public training summary validates output and discards process details", () => {
  const result = {
    candidate: "product-v2-test",
    activated: false,
    trainCount: 100,
    validationCount: 40,
    testCount: 512,
    reasons: ["Regression"],
    deployedControlAccuracy: 0.9,
  };
  assert.deepEqual(
    parseTrainingResult(JSON.stringify({ ...result, secret: "database password" })),
    result,
  );
  const learning = {mode:"warm-start",parentId:"active-test",rate:0.005,initialValidationLoss:0.5,bestValidationLoss:0.4,weightsUpdated:true};
  assert.deepEqual(parseTrainingResult(JSON.stringify({...result,learning:{...learning,secret:"private"}})), {...result,learning});
  assert.throws(()=>parseTrainingResult(JSON.stringify({...result,learning:{...learning,rate:0}})));
  assert.throws(()=>parseTrainingResult(JSON.stringify({...result,learning:{...learning,parentId:null}})));
  assert.throws(() => parseTrainingResult("error: private diagnostics"));
  assert.throws(() => parseTrainingResult(JSON.stringify({ ...result, activated: "true" })));
  assert.throws(() => parseTrainingResult(JSON.stringify({ ...result, trainCount: -1 })));
  assert.throws(() => parseTrainingResult(JSON.stringify({ ...result, reasons: [{}] })));
  assert.throws(() =>
    parseTrainingResult(JSON.stringify({ ...result, deployedControlAccuracy: 1.1 })),
  );
});
