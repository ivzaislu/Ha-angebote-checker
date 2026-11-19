/** Operator-only learning/activation. Public web requests cannot invoke this CLI. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { authoredDataset, type AuthoredProduct } from "../src/lib/product-data.ts";
import { prepareTrainingData, type TrainingSource } from "../src/lib/offer-archive.ts";
import {
  prepareProductDataset,
  trainProductModel,
  classificationMetrics,
  qualityGate,
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
import { offerFits } from "../src/lib/exact.ts";

const [command, ...args] = process.argv.slice(2);
if (!["train", "status", "activate", "rollback", "deactivate", "review"].includes(command))
  throw new Error(
    "Usage: brain train [--activate-if-qualified] [--reviewed file] [--epochs 1..100] | status | deactivate | activate ID | rollback ID | review output.jsonl",
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
const sql = {
  query: async <T>(text: string, params?: unknown[]): Promise<T[]> =>
    (await pool.query(text, params)).rows as T[],
};
const summary = (report: Awaited<ReturnType<typeof trainProductModel>>["report"]) => ({
  trainCount: report.trainCount,
  validationCount: report.validationCount,
  testCount: report.testCount,
  sources: report.sources,
  epochs: report.epochs,
  bestEpoch: report.bestEpoch,
  validationAccuracy: report.validation.accuracy,
  controlAccuracy: report.test.accuracy,
  rulesControlAccuracy: report.rules.accuracy,
  eligible: report.eligible,
  reasons: report.reasons,
  warning: report.labelWarning,
});
try {
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
      const current = champion
        ? classificationMetrics(test, (row) => productProbability(champion.net, row))
        : classificationMetrics(test, (row) =>
            offerFits(row.intent, row.name, row.description, row.category) ? 1 : 0,
          );
      const reasons = qualityGate(
        candidate.report.validation,
        classificationMetrics(test, (row) => productProbability(candidate.net, row)),
        candidate.report.trainCount,
        current,
      );
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
      if (args.length !== 1) throw new Error("Specify a new JSONL output path");
      const existing = new Set((await readReviewedLabels(sql)).map(exampleKey));
      const seed = JSON.parse(
        await readFile(new URL("../src/lib/product-seed.json", import.meta.url), "utf8"),
      );
      const net = champion?.net ?? seed.net;
      const rows = weak
        .filter((row) => !existing.has(exampleKey(row)))
        .map((row) => ({ ...row, reviewed: false, modelScore: productProbability(net, row) }))
        .sort((a, b) => Math.abs(a.modelScore - 0.5) - Math.abs(b.modelScore - 0.5))
        .slice(0, 100);
      await writeFile(
        args[0],
        rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
        { flag: "wx", mode: 0o600 },
      );
      console.log(
        `${rows.length} suggestions written; correct positive and set reviewed=true only after checking each example`,
      );
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
            for await (const chunk of process.stdin) {
              content += chunk;
              if (content.length > 10_000_000) throw new Error("Review file exceeds 10 MB");
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
      const { net, report } = trainProductModel(dataset, { epochs, champion: champion?.net });
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
  await pool.end();
}
