/** Isolated GitHub/local experiment: never connects to the production database. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { authoredDataset } from "../src/lib/product-data.ts";
import { parseArchiveLessons } from "../src/lib/archive-lessons.ts";
import { prepareProductDataset, trainProductModel, productGroup, exampleKey } from "../src/lib/product-training.ts";
import { evaluateProductPolicy } from "../src/lib/product-evaluation.ts";
import { policyForModel, decideWithProductPolicy } from "../src/lib/product-policy.ts";
import type { ProductModelPackage } from "../src/lib/product-model-store.ts";

const [pagesPath, labelsPath, outputPath] = process.argv.slice(2);
if (!pagesPath || !labelsPath || !outputPath || process.argv.length !== 5)
  throw new Error("Usage: train-archive-pilot.ts pages.jsonl annotations.jsonl output-directory");
const annotationsContent = await readFile(labelsPath,"utf8");
const lessons = parseArchiveLessons(annotationsContent,await readFile(pagesPath,"utf8"));
const sourceByName = new Map<string,string>(annotationsContent.split(/\r?\n/).filter(line=>line.trim())
  .map(line=>JSON.parse(line)).map(row=>[row.name.trim(),row.sourceUrl]));
const load = async(name:string) => JSON.parse(await readFile(new URL(`../src/lib/${name}`,import.meta.url),"utf8"));
const authored = authoredDataset(await load("product-curriculum.json"),await load("product-benchmark.json"));
const heldGroups = new Set(lessons.holdout.map(productGroup));
if (authored.control.some(row=>heldGroups.has(productGroup(row))))
  throw new Error("Archive holdout overlaps authored controls; choose different archive products");
const curriculum = authored.curriculum.filter(row=>!heldGroups.has(productGroup(row)));
const bundle = (result: ReturnType<typeof trainProductModel>):ProductModelPackage => ({
  id:`product-v2-${createHash("sha256").update(JSON.stringify([result.net,result.report])).digest("hex").slice(0,20)}`,
  ...result,
});
const baseline = bundle(trainProductModel(prepareProductDataset(curriculum,authored.control)));
const dataset = prepareProductDataset([...curriculum,...lessons.train],authored.control);
const admitted = new Set([...dataset.train,...dataset.validation].map(row=>exampleKey(row)+":"+row.positive));
const candidate = bundle(trainProductModel(dataset,{champion:baseline}));
const holdoutDecisions = lessons.holdout.map(row=>({
  intent:row.intent,name:row.name,category:row.category,description:row.description,
  sourceUrl:sourceByName.get(row.name),expected:row.positive,
  baseline:decideWithProductPolicy(policyForModel(baseline),row),
  candidate:decideWithProductPolicy(policyForModel(candidate),row),
}));
const evaluation = {
  datasetFingerprint:lessons.fingerprint,
  pages:lessons.pages,products:lessons.products,
  archiveTrainExamples:lessons.train.length,archiveHoldoutExamples:lessons.holdout.length,
  preparedArchiveExamples: lessons.train.length,
  admittedArchiveExamples: lessons.train.filter(row=>admitted.has(exampleKey(row)+":"+row.positive)).length,
  archiveClassCounts:{trainPositive:lessons.train.filter(row=>row.positive).length,
    trainNegative:lessons.train.filter(row=>!row.positive).length,
    holdoutPositive:lessons.holdout.filter(row=>row.positive).length,
    holdoutNegative:lessons.holdout.filter(row=>!row.positive).length},
  annotationSource:"assistant-curated",humanLabelsUsed:0,
  baseline:{id:baseline.id,eligible:baseline.report.eligible,control:baseline.report.deployment!.control.all},
  candidate:{id:candidate.id,eligible:candidate.report.eligible,reasons:candidate.report.reasons,
    control:candidate.report.deployment!.control.all,learning:candidate.report.learning},
  archiveHoldout:{baseline:evaluateProductPolicy(policyForModel(baseline),lessons.holdout),
    candidate:evaluateProductPolicy(policyForModel(candidate),lessons.holdout)},
  activated:false,productionDatabaseAccessed:false,
  warning:"Small assistant-curated pilot, not independent ground truth or a production accuracy estimate. Release eligibility compares only the isolated authored baseline, not the VPS active model. Holdout labels never select weights, epochs or scope.",
};
await mkdir(resolve(outputPath));
for(const [name,value] of [["baseline.json",baseline],["candidate.json",candidate],["evaluation.json",evaluation]] as const)
  await writeFile(resolve(outputPath,name),JSON.stringify(value,null,2)+"\n",{flag:"wx"});
await writeFile(resolve(outputPath,"holdout-decisions.jsonl"),holdoutDecisions.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx"});
await writeFile(resolve(outputPath,"training-examples.jsonl"),lessons.train.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx"});
console.log(JSON.stringify(evaluation,null,2));
