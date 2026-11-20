/** Learning/activation CLI, also used by the authenticated background worker. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { authoredDataset, type AuthoredProduct } from "../src/lib/product-data.ts";
import { prepareTrainingData, type TrainingSource } from "../src/lib/offer-archive.ts";
import {
  prepareProductDataset,
  trainProductModel,
  classificationMetrics,
  evaluateTrainedProduct,
  exampleKey,
} from "../src/lib/product-training.ts";
import { productProbability, type ProductExample } from "../src/lib/product-net.ts";
import { parseReviewedExamples } from "../src/lib/product-review.ts";
import {
  saveProductCandidate,
  readProductCandidate,
  activeProductModelId,
  activateProductCandidate,
  saveReviewedLabels,
  readReviewedLabels,
  deactivateProductModel,
} from "../src/lib/product-model-store.ts";
import { qualityGate, evaluateProductPolicy } from "../src/lib/product-evaluation.ts";
import { policyForModel, decideWithProductPolicy } from "../src/lib/product-policy.ts";
import { TRAINING_LOCK } from "../src/lib/product-training-jobs.ts";

const [command, ...args] = process.argv.slice(2);
if (
  !["train", "status", "activate", "rollback", "deactivate", "review", "recheck"].includes(command)
)
  throw new Error(
    "Usage: brain train [--activate-if-qualified] [--reviewed file] [--epochs 1..100] | status | deactivate | activate ID | rollback ID | review output.jsonl [--model ID] | recheck ID [--activate-if-qualified]",
  );
if (!process.env.DATABASE_URL?.trim())
  throw new Error("A persistent DATABASE_URL is required; apply migrations first");
const load = async (name: string) =>
  JSON.parse(
    await readFile(new URL(`../src/lib/${name}`, import.meta.url), "utf8"),
  ) as AuthoredProduct[];
const authored = authoredDataset(
  await load("product-curriculum.json"),
  await load("product-benchmark.json"),
);
const test = authored.control;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let trainingLock: pg.PoolClient | undefined;
let trainingLockLost = false;
const sql = {
  query: async <T>(text: string, params?: unknown[]): Promise<T[]> =>
    (await pool.query(text, params)).rows as T[],
};
const summary = (report: Awaited<ReturnType<typeof trainProductModel>>["report"]) => ({
  featureVersion:report.featureVersion ?? 2,
  trainCount: report.trainCount,
  validationCount: report.validationCount,
  testCount: report.testCount,
  sources: report.sources,
  epochs: report.epochs,
  bestEpoch: report.bestEpoch,
  evaluationPolicy: report.deployment?.version ?? 1,
  rawValidationAgreement: report.validation.accuracy,
  rawControlAccuracy: report.test.accuracy,
  trustedValidationAccuracy: report.trustedValidation?.accuracy ?? null,
  deployedValidationAccuracy: report.deployment?.trustedValidation.all.accuracy ?? null,
  deployedControlAccuracy: report.deployment?.control.all.accuracy ?? null,
  deployedControlFalseMatches: report.deployment?.control.all.fp ?? null,
  baselineName: report.deployment?.baselineName ?? "legacy comparison",
  baselineControlFalseMatches: report.deployment?.baselineControl.all.fp ?? null,
  neuralValidationAcceptPrecision:
    report.deployment?.trustedValidation.neural.acceptedPrecision ?? null,
  weakNeuralAgreementPrecision: report.deployment?.weakValidation.neural.acceptedPrecision ?? null,
  weakNeuralConflicts: report.deployment?.weakValidation.neural.confidentErrors ?? null,
  eligible: report.eligible,
  reasons: report.reasons,
  warning: report.labelWarning,
});
try {
  if (process.env.TRAINING_JOB_ID) {
    if (command !== "train") throw new Error("A background job must use train");
    trainingLock = await pool.connect();
    trainingLock.on("error", () => { trainingLockLost = true; });
    await trainingLock.query("select pg_advisory_lock_shared($1)", [TRAINING_LOCK]);
    const job = await trainingLock.query(
      "select id from product_training_jobs where id=$1 and status='running'", [process.env.TRAINING_JOB_ID],
    );
    if (!job.rowCount) throw new Error("Training job is no longer running");
  }
  const activeId = await activeProductModelId(sql);
  const champion = activeId ? await readProductCandidate(sql, activeId) : null;
  if (command === "status") {
    if (args.length) throw new Error("status takes no arguments");
    const versions = await sql.query(
      "select id,created_at,activated_at,report->>'eligible' as eligible from product_models order by created_at desc limit 10",
    );
    console.log(
      JSON.stringify(
        { active: champion ? { id: champion.id, ...summary(champion.report) } : null, versions },
        null,
        2,
      ),
    );
  } else if (command === "deactivate") {
    if (args.length) throw new Error("deactivate takes no arguments");
    if (activeId) await deactivateProductModel(sql, activeId);
    console.log(JSON.stringify({ active: null, action: "deactivate" }));
  } else if (command === "activate" || command === "rollback") {
    if (args.length !== 1) throw new Error("Specify a model ID from status");
    const candidate = await readProductCandidate(sql, args[0]);
    if (!candidate || !candidate.report.eligible)
      throw new Error("Unknown or unqualified candidate");
    if (command === "activate") {
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(test.map((row) => [exampleKey(row), row.positive])))
        .digest("hex");
      if (candidate.report.controlFingerprint !== fingerprint)
        throw new Error("Control set changed; retrain this candidate");
      if (candidate.report.schemaVersion !== 2 || !candidate.report.deployment)
        throw new Error("Obsolete evaluation policy; recheck the candidate");
      const evaluation = {
        ...candidate.report.deployment,
        control: evaluateProductPolicy(policyForModel(candidate), test),
        baselineControl: evaluateProductPolicy(champion ? policyForModel(champion) : null, test),
        baselineName: champion ? ("active model" as const) : ("rules baseline" as const),
      };
      const reasons = qualityGate(evaluation, candidate.report.trainCount);
      if (reasons.length) throw new Error(`Activation refused: ${reasons.join("; ")}`);
    }
    await activateProductCandidate(sql, candidate.id, activeId, command);
    console.log(JSON.stringify({ active: candidate.id, action: command }));
  } else {
    const snapshots =
      await sql.query<TrainingSource>(`select snapshot_id,country,offer_id,name,description,category,variant_key
      from offer_archive where country='de' order by observed_at desc,snapshot_id limit 10000`);
    const weak = prepareTrainingData(snapshots).map((row) => ({
      intent: row.intent,
      name: row.name,
      category: row.category,
      description: row.description,
      positive: row.positive,
      source: "rules" as const,
    }));
    if (command === "review") {
      if (args.length !== 1 && !(args.length === 3 && args[1] === "--model"))
        throw new Error("review requires output.jsonl [--model ID]");
      const selected = args[2] ? await readProductCandidate(sql, args[2]) : champion;
      if (args[2] && !selected) throw new Error("Unknown review model");
      const existing = new Set((await readReviewedLabels(sql)).map(exampleKey));
      const seed = JSON.parse(
        await readFile(new URL("../src/lib/product-seed.json", import.meta.url), "utf8"),
      );
      const inspected = selected ?? seed;
      const net = inspected.net;
      const inspectedPolicy = policyForModel(inspected);
      const rows = weak
        .filter(
          (row) =>
            row.description.length <= 600 &&
            row.category.length <= 180 &&
            !existing.has(exampleKey(row)),
        )
        .map((row) => {
          const decision = decideWithProductPolicy(inspectedPolicy, row);
          return {
            ...row,
            reviewed: false,
            modelScore: productProbability(net, row),
            deployedDecision: decision.keep,
            neuralDecision: decision.fromBrain,
            unreviewedConflict: decision.fromBrain && decision.keep !== row.positive,
          };
        })
        .sort(
          (a, b) =>
            Number(b.unreviewedConflict) - Number(a.unreviewedConflict) ||
            Math.abs(a.modelScore - 0.5) - Math.abs(b.modelScore - 0.5),
        )
        .slice(0, 100);
      await writeFile(
        args[0],
        rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
        { flag: "wx", mode: 0o600 },
      );
      console.log(
        `${rows.length} suggestions written; correct positive and set reviewed=true only after checking each example`,
      );
    } else if (command === "recheck") {
      if (!args[0] || args.length > 2 || (args[1] && args[1] !== "--activate-if-qualified"))
        throw new Error("recheck requires ID [--activate-if-qualified]");
      const original = await readProductCandidate(sql, args[0]);
      if (!original) throw new Error("Unknown candidate");
      const dataset = prepareProductDataset(
        [...authored.curriculum, ...weak, ...(await readReviewedLabels(sql))],
        test,
      );
      if (dataset.fingerprint !== original.report.datasetFingerprint)
        throw new Error(
          "Dataset changed since this candidate was trained; run train instead of recheck",
        );
      const report = evaluateTrainedProduct(
        original.net,
        dataset,
        { epochs: original.report.epochs, bestEpoch: original.report.bestEpoch },
        champion ?? undefined,
      );
      const candidate = await saveProductCandidate(sql, original.net, report);
      let activated = false;
      if (args[1] && report.eligible) {
        await activateProductCandidate(sql, candidate.id, activeId);
        activated = true;
      }
      console.log(
        JSON.stringify(
          {
            candidate: candidate.id,
            recheckedFrom: original.id,
            weightsUnchanged: true,
            activated,
            ...summary(report),
          },
          null,
          2,
        ),
      );
      if (args[1] && !activated) process.exitCode = 2;
    } else {
      let reviewed: ProductExample[] = [],
        epochs = 40,
        activate = false;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--activate-if-qualified") activate = true;
        else if (args[i] === "--epochs") epochs = Number(args[++i]);
        else if (args[i] === "--reviewed") {
          const path = args[++i];
          if (!path) throw new Error("--reviewed requires a file");
          let content = "";
          if (path === "-") {
            process.stdin.setEncoding("utf8");
            let bytes = 0;
            for await (const chunk of process.stdin) {
              bytes += Buffer.byteLength(chunk, "utf8");
              content += chunk;
              if (bytes > 10_000_000) throw new Error("Review file exceeds 10 MB");
            }
          } else content = await readFile(path, "utf8");
          reviewed = parseReviewedExamples(content);
        } else throw new Error(`Unknown training argument: ${args[i]}`);
      }
      const importedLabels = reviewed.length ? await saveReviewedLabels(sql, reviewed) : 0;
      reviewed = await readReviewedLabels(sql);
      if (!snapshots.length && !reviewed.length)
        throw new Error(
          "Archive and reviewed data are empty; collect offers before production training",
        );
      const dataset = prepareProductDataset([...authored.curriculum, ...weak, ...reviewed], test);
      console.error("PRODUCT_TRAINING_STAGE=training");
      const { net, report } = trainProductModel(dataset, {
        epochs,
        champion: champion ?? undefined,
      });
      console.error("PRODUCT_TRAINING_STAGE=checking");
      if (trainingLock) {
        // Keep recovery blocked even if only the coordinator process is killed.
        if (trainingLockLost) throw new Error("Training database ownership lost");
        const job = await trainingLock.query(
          "select id from product_training_jobs where id=$1 and status='running'", [process.env.TRAINING_JOB_ID],
        );
        if (!job.rowCount || trainingLockLost) throw new Error("Training job was interrupted");
      }
      const candidate = await saveProductCandidate(sql, net, report);
      let activated = false;
      if (activate && report.eligible) {
        await activateProductCandidate(sql, candidate.id, activeId);
        activated = true;
      }
      console.log(
        JSON.stringify(
          {
            candidate: candidate.id,
            activated,
            importedLabels,
            reviewedLabelsRead: reviewed.length,
            reviewedReadLimit: 10000,
            archiveSnapshotsRead: snapshots.length,
            archiveReadLimit: 10000,
            ...summary(report),
          },
          null,
          2,
        ),
      );
      if (activate && !activated) process.exitCode = 2;
    }
  }
} finally {
  if (trainingLock) {
    await trainingLock.query("select pg_advisory_unlock_shared($1)", [TRAINING_LOCK]).catch(() => {});
    trainingLock.release();
  }
  await pool.end();
}
