import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authoredDataset } from "./product-data.ts";
import { PGlite } from "@electric-sql/pglite";
import {
  newProductNet,
  validProductNet,
  productFeatures,
  productProbability,
  productTrainingStep,
  binaryLoss,
  type ProductExample,
} from "./product-net.ts";
import {
  prepareProductDataset,
  trainProductModel,
  classificationMetrics,
  qualityGate,
  productGroup,
} from "./product-training.ts";
import {
  saveProductCandidate,
  readProductCandidate,
  activateProductCandidate,
  activeProductModelId,
  saveReviewedLabels,
  readReviewedLabels,
  deactivateProductModel,
  type ProductModelPackage,
} from "./product-model-store.ts";
import { decideProduct } from "./product-policy.ts";
import { parseReviewedExamples } from "./product-review.ts";
const load = async (name: string) =>
  JSON.parse(await readFile(new URL(`./${name}`, import.meta.url), "utf8"));

test("query-conditioned network learns opposing labels for identical product text", () => {
  const net = newProductNet();
  const yes = { intent: "Milch", name: "Frische Milch", category: "Milch", description: "1 l" };
  const no = { ...yes, intent: "Buttermilch" };
  for (let i = 0; i < 200; i++) {
    productTrainingStep(net, productFeatures(yes), true, 0.03);
    productTrainingStep(net, productFeatures(no), false, 0.03);
  }
  assert.ok(productProbability(net, yes) > 0.9);
  assert.ok(productProbability(net, no) < 0.1);
  assert.equal(validProductNet(net), true);
  assert.equal(validProductNet({ ...net, w1: [NaN] }), false);
  assert.equal(validProductNet({ ...net, version: 1 }), false);
});

test("backpropagation matches numerical gradients", () => {
  const row = { intent: "Milch", name: "Frische Milch", category: "Milch", description: "" };
  const original = newProductNet(),
    updated = structuredClone(original),
    features = productFeatures(row),
    rate = 0.0001,
    epsilon = 0.00001;
  productTrainingStep(updated, features, true, rate);
  for (const [field, index] of [
    ["w1", features[0]],
    ["w2", 0],
    ["b1", 0],
  ] as const) {
    const high = structuredClone(original),
      low = structuredClone(original);
    high[field][index] += epsilon;
    low[field][index] -= epsilon;
    const numeric =
      (binaryLoss(productProbability(high, row), true) -
        binaryLoss(productProbability(low, row), true)) /
      (2 * epsilon);
    const analytic = (original[field][index] - updated[field][index]) / rate;
    assert.ok(Math.abs(numeric - analytic) < 0.0001, `${field}: ${numeric} vs ${analytic}`);
  }
});

test("dataset deduplicates regional copies, excludes control names and honours reviewed corrections", () => {
  const row: ProductExample = {
    intent: "Milch",
    name: "Frische Milch",
    category: "Milch",
    description: "1 l",
    positive: true,
    source: "rules",
  };
  const held = { ...row, name: "Held-out Milk" };
  const dataset = prepareProductDataset(
    [
      row,
      row,
      { ...row, positive: false, source: "human" },
      held,
      { ...row, name: "Conflict", positive: true },
      { ...row, name: "Conflict", positive: false },
    ],
    [held],
  );
  const accepted = [...dataset.train, ...dataset.validation];
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].positive, false);
  assert.equal(accepted[0].source, "human");
  assert.equal(dataset.conflicts, 1);
  assert.ok(!accepted.some((item) => productGroup(item) === productGroup(held)));
  const trainGroups = new Set(dataset.train.map(productGroup));
  assert.ok(dataset.validation.every((item) => !trainGroups.has(productGroup(item))));
});

test("training is deterministic, never fits the control set and reproduces the bundled candidate", async () => {
  const authored = authoredDataset(
    await load("product-curriculum.json"),
    await load("product-benchmark.json"),
  );
  const curriculum = authored.curriculum,
    control = authored.control;
  const dataset = prepareProductDataset(curriculum, control);
  const first = trainProductModel(dataset),
    second = trainProductModel(dataset);
  assert.deepEqual(first, second);
  const changed = { ...dataset, test: control.map((row) => ({ ...row, positive: !row.positive })) };
  const alternate = trainProductModel(changed);
  assert.deepEqual(first.net, alternate.net);
  assert.equal(first.report.eligible, true, first.report.reasons.join("; "));
  const seed: ProductModelPackage = await load("product-seed.json");
  const scores = classificationMetrics(control, (row) => productProbability(seed.net, row));
  assert.equal(scores.tp, seed.report.test.tp);
  assert.equal(scores.fp, seed.report.test.fp);
  assert.equal(seed.report.datasetFingerprint, first.report.datasetFingerprint);
  assert.equal(seed.report.controlFingerprint, first.report.controlFingerprint);
  const groups = new Set([...dataset.train, ...dataset.validation].map(productGroup));
  assert.ok(control.every((row) => !groups.has(productGroup(row))));
});

test("empty/one-class validation and regressing candidates cannot pass the gate", () => {
  const empty = classificationMetrics([], () => 0.5);
  assert.equal(empty.accuracy, null);
  assert.equal(empty.acceptedPrecision, null);
  assert.ok(qualityGate(empty, empty, 0).length > 0);
  const rows: ProductExample[] = Array.from({ length: 50 }, (_, i) => ({
    intent: "Milch",
    name: `Milk ${i}`,
    category: "",
    description: "",
    positive: i % 2 === 0,
    source: "curated",
  }));
  const perfect = classificationMetrics(rows, (row) => (row.positive ? 0.99 : 0.01));
  assert.deepEqual(qualityGate(perfect, perfect, 100), []);
  const reversed = classificationMetrics(rows, (row) => (row.positive ? 0.01 : 0.99));
  assert.ok(
    qualityGate(perfect, reversed, 100, perfect).some((reason) => reason.includes("Regression")),
  );
});

test("review suggestions are never silently treated as human labels", () => {
  const row = {
    intent: "Haferdrink",
    name: "Haferdrink",
    category: "Milch",
    description: "",
    positive: true,
  };
  assert.throws(() => parseReviewedExamples(JSON.stringify(row)), /No explicitly/);
  assert.equal(
    parseReviewedExamples(JSON.stringify({ ...row, reviewed: true }))[0].intent,
    "Hafermilch",
  );
  assert.equal(
    parseReviewedExamples(JSON.stringify({ ...row, reviewed: true }))[0].source,
    "human",
  );
  assert.throws(
    () => parseReviewedExamples(JSON.stringify({ ...row, reviewed: true, positive: "true" })),
    /Invalid reviewed/,
  );
});

test("inference abstains outside trained scope and preserves hard product exclusions", async () => {
  const seed: ProductModelPackage = await load("product-seed.json");
  const row = { intent: "Milch", name: "Frische Milch", description: "Bio 1 l", category: "" };
  assert.equal(decideProduct(null, row).fromBrain, false);
  assert.equal(decideProduct(seed, row).keep, true);
  const alwaysYes = structuredClone(seed);
  alwaysYes.net.w1.fill(0);
  alwaysYes.net.w2.fill(0);
  alwaysYes.net.b1.fill(0);
  alwaysYes.net.b2 = 10;
  assert.equal(decideProduct(alwaysYes, { ...row, name: "Buttermilch" }).keep, false);
  assert.equal(
    decideProduct(alwaysYes, { ...row, intent: "Lachs", name: "Seelachsfilet" }).keep,
    false,
  );
  assert.equal(
    decideProduct(alwaysYes, { ...row, intent: "Dorade", name: "Dorade" }).fromBrain,
    false,
  );
  assert.equal(
    decideProduct(alwaysYes, { ...row, name: "XYZ Unknown", description: "", category: "" })
      .fromBrain,
    false,
  );
});

test("candidate registry preserves versions, refuses failed activation, detects stale leases and supports rollback", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(new URL("../../migrations/0004_product_models.sql", import.meta.url), "utf8"),
    );
    const sql = {
      query: async <T>(text: string, params?: unknown[]): Promise<T[]> =>
        (await db.query<T>(text, params)).rows,
    };
    const seed: ProductModelPackage = await load("product-seed.json");
    const a = await saveProductCandidate(sql, seed.net, seed.report);
    assert.equal((await saveProductCandidate(sql, seed.net, seed.report)).id, a.id);
    assert.equal(await activeProductModelId(sql), null);
    const failed = await saveProductCandidate(sql, seed.net, {
      ...seed.report,
      eligible: false,
      reasons: ["bad candidate"],
    });
    await assert.rejects(activateProductCandidate(sql, failed.id, null), /quality gate/);
    await assert.rejects(
      activateProductCandidate(sql, a.id, null, "rollback"),
      /previously activated/,
    );
    await activateProductCandidate(sql, a.id, null);
    assert.equal(await activeProductModelId(sql), a.id);
    const next = structuredClone(seed.net);
    next.b2 += 0.01;
    const b = await saveProductCandidate(sql, next, seed.report);
    await assert.rejects(activateProductCandidate(sql, b.id, null), /changed concurrently/);
    await activateProductCandidate(sql, b.id, a.id);
    assert.equal(await activeProductModelId(sql), b.id);
    await activateProductCandidate(sql, a.id, b.id, "rollback");
    assert.equal(await activeProductModelId(sql), a.id);
    assert.deepEqual((await readProductCandidate(sql, a.id))?.net, seed.net);
    const [count] = await sql.query<{ n: number }>(
      "select count(*)::int as n from product_model_events",
    );
    assert.equal(count.n, 3);
    await deactivateProductModel(sql, a.id);
    assert.equal(await activeProductModelId(sql), null);
    const label: ProductExample = {
      intent: "Milch",
      name: "Test Milch",
      category: "Milch",
      description: "1 l",
      positive: true,
      source: "human",
    };
    await assert.rejects(
      saveReviewedLabels(sql, [{ ...label, source: "rules" }]),
      /explicitly reviewed/,
    );
    assert.equal(await saveReviewedLabels(sql, [label]), 1);
    assert.equal((await readReviewedLabels(sql))[0].positive, true);
    await saveReviewedLabels(sql, [{ ...label, positive: false }]);
    assert.equal((await readReviewedLabels(sql)).length, 1);
    assert.equal((await readReviewedLabels(sql))[0].positive, false);
  } finally {
    await db.close();
  }
});
