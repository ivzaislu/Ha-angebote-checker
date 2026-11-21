/** Offline authored-data experiment; the database trainer uses the same pipeline. */
import { readFile, writeFile } from "node:fs/promises";
import { prepareProductDataset, trainProductModel } from "../src/lib/product-training.ts";
import { authoredDataset, type AuthoredProduct } from "../src/lib/product-data.ts";
const load = async (name: string) =>
  JSON.parse(
    await readFile(new URL(`../src/lib/${name}`, import.meta.url), "utf8"),
  ) as AuthoredProduct[];
const authored = authoredDataset(
  await load("product-curriculum.json"),
  await load("product-benchmark.json"),
);
const dataset = prepareProductDataset(authored.curriculum, authored.control);
const result = trainProductModel(dataset);
console.log(JSON.stringify(result.report, null, 2));
if (process.argv.includes("--write-seed")) {
  if (!result.report.eligible)
    throw new Error("Candidate failed the quality gate; bundled model unchanged");
  // Round only serialization; report is recomputed by tests against this saved model.
  for (const values of [result.net.w1, result.net.w2, result.net.b1])
    for (let i = 0; i < values.length; i++) values[i] = Math.round(values[i] * 1e6) / 1e6;
  result.net.b2 = Math.round(result.net.b2 * 1e6) / 1e6;
  await writeFile(
    new URL("../src/lib/product-seed.json", import.meta.url),
    JSON.stringify({ id: `seed-v2-${dataset.fingerprint.slice(0, 12)}`, ...result }),
  );
}
