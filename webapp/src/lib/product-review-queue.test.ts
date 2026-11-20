import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { archiveOffers, prepareTrainingData, type TrainingSource } from "./offer-archive.ts";
import { newProductNet, type ProductExample } from "./product-net.ts";
import type { ProductModelPackage } from "./product-model-store.ts";
import { readReviewedLabels } from "./product-model-store.ts";
import { prepareProductDataset, productGroup } from "./product-training.ts";
import { reviewPresentation } from "./review-presentation.ts";
import {
  loadReviewQueue,
  reviewCandidates,
  reviewedKey,
  saveArchiveReview,
} from "./product-review-queue.ts";

const snapshot: TrainingSource = {
  snapshot_id: "milk",
  offer_id: "o",
  country: "de",
  name: "Frische Milch",
  category: "",
  description: "Bio 1 l",
  variant_key: "{}",
};
test("review presents fuller source titles and safe CDN photos without changing training identity", () => {
  const row = { ...snapshot, offer_name: "Alpen Bio Frische Milch", catalog_name: snapshot.name };
  const [card] = reviewCandidates([row], new Set(), null, new Set());
  assert.equal(card.displayName, row.offer_name);
  assert.equal(card.name, snapshot.name);
  assert.deepEqual(card.otherNames, [snapshot.name]);
  assert.equal(
    card.imageUrl,
    "https://cdn.marktguru.de/api/v1/offers/o/images/default/0/medium.webp",
  );
  assert.equal(
    card.id,
    reviewedKey({ ...snapshot, intent: card.intent, positive: true, source: "human" }),
  );
  const short = reviewPresentation({ ...snapshot, name: "Original" });
  assert.equal(short.displayName, "Original");
  assert.equal(short.shortName, true);
  const other = reviewPresentation({ ...snapshot, name: "Cremefine", offer_name: "Rama" });
  assert.equal(other.displayName, "Cremefine");
  assert.deepEqual(other.otherNames, ["Rama"]);
  assert.equal(reviewPresentation({ ...snapshot, country: "unknown" }).imageUrl, null);
  assert.equal(reviewPresentation({ ...snapshot, offer_id: "" }).imageUrl, null);
  const encoded = new URL(
    reviewPresentation({ ...snapshot, offer_id: "https://evil.test/a?x=1" }).imageUrl!,
  );
  assert.equal(encoded.hostname, "cdn.marktguru.de");
  assert.equal(encoded.search, "");
});
test("review queue excludes controls, oversized texts, non-German and already reviewed examples", () => {
  const first = reviewCandidates(
    [snapshot, { ...snapshot, snapshot_id: "duplicate" }],
    new Set(),
    null,
    new Set(),
  );
  assert.equal(first.length, 2); // Milch positive and Reis hard-negative; no price/region duplicates.
  const row: ProductExample = {
    ...snapshot,
    intent: first[0].intent,
    positive: true,
    source: "human",
  };
  const next = reviewCandidates([snapshot], new Set([reviewedKey(row)]), null, new Set());
  assert.equal(next.length, 1);
  assert.notEqual(next[0].intent, first[0].intent);
  assert.deepEqual(reviewCandidates([snapshot], new Set(), null, new Set([productGroup(row)])), []);
  assert.deepEqual(
    reviewCandidates([{ ...snapshot, country: "at" }], new Set(), null, new Set()),
    [],
  );
  assert.deepEqual(
    reviewCandidates([{ ...snapshot, description: "x".repeat(601) }], new Set(), null, new Set()),
    [],
  );
});

test("actual deployed conflicts are prioritized without exposing automatic labels as answers", () => {
  const net = newProductNet();
  net.w2.fill(0);
  net.b2 = -10;
  const model = {
    id: "test",
    net,
    report: { eligible: true, supportedIntents: ["Milch"], vocabulary: ["milch"] },
  } as ProductModelPackage;
  const cards = reviewCandidates([snapshot], new Set(), model, new Set());
  assert.equal(cards[0].intent, "Milch");
  assert.equal(cards[0].reason, "conflict");
  assert.equal("positive" in cards[0], false);
  assert.equal("modelScore" in cards[0], false);
});

test("obvious category mismatches such as Salat versus face cream are omitted from manual review", () => {
  const cards = reviewCandidates(
    [{ ...snapshot, name: "Creme", category: "Gesichtspflege", description: "200-ml-Tiegel" }],
    new Set(),
    null,
    new Set(),
  );
  assert.deepEqual(cards, []);
  const milk = reviewCandidates([snapshot], new Set(), null, new Set());
  assert.ok(milk.length > 0, "Unknown category must not erase useful negative examples");
});

test("distant food-category negatives do not crowd the queue", () => {
  const rows = [
    { ...snapshot, name: "Champignons", description: "mit Weisswein", category: "Gemüse" },
  ];
  assert.ok(prepareTrainingData(rows).some((row) => row.intent === "Rotwein" && !row.positive));
  assert.ok(
    reviewCandidates(rows, new Set(), null, new Set()).every((row) => row.intent !== "Rotwein"),
  );
});

test("archive answers persist human labels, reject stale overwrites, and enter the next training dataset", async () => {
  const db = new PGlite();
  try {
    for (const migration of ["0003_offer_archive.sql", "0004_product_models.sql"])
      await db.exec(
        await readFile(new URL(`../../migrations/${migration}`, import.meta.url), "utf8"),
      );
    const sql = {
      query: async <T>(text: string, params?: unknown[]) => (await db.query<T>(text, params)).rows,
    };
    await archiveOffers(sql, "de", "73431", [
      {
        id: "milk",
        name: "Alpen Bio Frische Milch",
        product: { name: snapshot.name },
        description: snapshot.description,
        price: 1.29,
      },
    ]);
    await archiveOffers(sql, "de", "10115", [
      {
        id: "other-region",
        name: "Alpen Bio Frische Milch",
        product: { name: snapshot.name },
        description: snapshot.description,
        price: 1.79,
      },
    ]);
    await archiveOffers(sql, "at", "1010", [{ id: "at", name: "Hafermilch", price: 2 }]);
    const before = await loadReviewQueue(sql, null, new Set());
    assert.equal(before.cards.length, 2);
    assert.ok(before.cards.every((card) => card.displayName === "Alpen Bio Frische Milch"));
    assert.ok(before.cards.every((card) => card.name === snapshot.name));
    assert.equal(before.reviewedCount, 0);
    const card = before.cards.find((row) => row.intent === "Milch")!;
    const answer = { snapshotId: card.snapshotId, intent: card.intent, positive: true };
    assert.equal((await saveArchiveReview(sql, answer, new Set())).reviewedCount, 1);
    assert.equal(
      (await saveArchiveReview(sql, answer, new Set())).reviewedCount,
      1,
      "Duplicate click is idempotent",
    );
    await assert.rejects(
      saveArchiveReview(sql, { ...answer, positive: false }, new Set()),
      /другой вкладке/,
    );
    await saveArchiveReview(sql, { ...answer, positive: false, expectedPositive: true }, new Set());
    assert.equal((await readReviewedLabels(sql))[0].positive, false);
    await saveArchiveReview(sql, { ...answer, expectedPositive: false }, new Set());
    const labels = await readReviewedLabels(sql);
    assert.equal(labels.length, 1);
    assert.equal(labels[0].source, "human");
    assert.equal(labels[0].positive, true);
    assert.equal(labels[0].name, snapshot.name, "Text must come from immutable archive");
    const dataset = prepareProductDataset(labels, []);
    assert.equal(
      dataset.sources.human,
      1,
      "The standard trainer reads these same persisted labels",
    );
    const after = await loadReviewQueue(sql, null, new Set());
    assert.equal(after.reviewedCount, 1);
    assert.ok(after.cards.every((row) => row.intent !== "Milch"));
    const [models] = await sql.query<{ count: number }>(
      "select count(*)::int as count from product_models",
    );
    assert.equal(models.count, 0, "Reviewing does not train or activate weights");
    await assert.rejects(
      saveArchiveReview(sql, { ...answer, snapshotId: "missing" }, new Set()),
      /недоступен/,
    );
    await assert.rejects(
      saveArchiveReview(sql, { ...answer, intent: "invented query" }, new Set()),
      /недоступен/,
    );
    const [at] = await sql.query<{ snapshot_id: string }>(
      "select snapshot_id from offer_archive where country='at'",
    );
    await assert.rejects(
      saveArchiveReview(sql, { ...answer, snapshotId: at.snapshot_id }, new Set()),
      /недоступен/,
    );
    await assert.rejects(
      saveArchiveReview(sql, answer, new Set([productGroup(labels[0])])),
      /недоступен/,
    );
  } finally {
    await db.close();
  }
});
