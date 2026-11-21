import { inspectControlFailures } from "../src/lib/product-control-diagnostics.ts";
import { parseArchiveScope, prepareArchiveExperiment, preparePreviousArchiveDataset, archiveReleaseGate } from "../src/lib/archive-experiment.ts";
/** Isolated GitHub/local experiment: never connects to the production database. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { authoredDataset } from "../src/lib/product-data.ts";
import { parseArchiveLessons } from "../src/lib/archive-lessons.ts";
import { trainProductModel, exampleKey } from "../src/lib/product-training.ts";
import { evaluateProductPolicy } from "../src/lib/product-evaluation.ts";
import { policyForModel, decideWithProductPolicy } from "../src/lib/product-policy.ts";
import type { ProductModelPackage } from "../src/lib/product-model-store.ts";

const [pagesPath, labelsPath, outputPath, scopePath, previousPath] = process.argv.slice(2);
if (!pagesPath || !labelsPath || !outputPath || ![5,6,7].includes(process.argv.length))
  throw new Error("Usage: train-archive-pilot.ts pages.jsonl annotations.jsonl output-directory [authored-scope.json] [previous-annotations.jsonl]");
const annotationsContent = await readFile(labelsPath,"utf8");
const pagesContent=await readFile(pagesPath,"utf8");
const lessons = parseArchiveLessons(annotationsContent,pagesContent);
const sourceByName = new Map<string,string>(annotationsContent.split(/\r?\n/).filter(line=>line.trim())
  .map(line=>JSON.parse(line)).map(row=>[row.name.trim(),row.sourceUrl]));
const load = async(name:string) => JSON.parse(await readFile(new URL(`../src/lib/${name}`,import.meta.url),"utf8"));
const authored = authoredDataset(await load("product-curriculum.json"),await load("product-benchmark.json"));
const scope = scopePath ? parseArchiveScope(await readFile(scopePath,"utf8")) : undefined;
const datasets = prepareArchiveExperiment(authored,lessons,scope);
const bundle = (result: ReturnType<typeof trainProductModel>):ProductModelPackage => ({
  id:`product-v2-${createHash("sha256").update(JSON.stringify([result.net,result.report])).digest("hex").slice(0,20)}`,
  ...result,
});
const baseline = bundle(trainProductModel(datasets.baseline));
const previousLessons=previousPath?parseArchiveLessons(await readFile(previousPath,"utf8"),pagesContent):null;
if(previousLessons&&!scope)throw new Error("Die vorherige Archivpartie benötigt ihre expliziten Lernfälle");
const previousArchive=previousLessons?bundle(trainProductModel(preparePreviousArchiveDataset(authored,lessons,previousLessons,scope!),{
 champion:baseline,initialization:{id:baseline.id,net:baseline.net},
})):null;
const initialization=previousArchive??baseline;
const dataset = datasets.candidate;
const admitted = new Set([...dataset.train,...dataset.validation].map(row=>exampleKey(row)+":"+row.positive));
const candidate = bundle(trainProductModel(dataset,{champion:baseline,initialization:{id:initialization.id,net:initialization.net}}));
const holdoutDecisions = lessons.holdout.map(row=>({
  intent:row.intent,name:row.name,category:row.category,description:row.description,
  sourceUrl:sourceByName.get(row.name),expected:row.positive,
  baseline:decideWithProductPolicy(policyForModel(baseline),row),
  previousArchive:previousArchive?decideWithProductPolicy(policyForModel(previousArchive),row):null,
  candidate:decideWithProductPolicy(policyForModel(candidate),row),
}));
const byBrochure=Object.fromEntries(Object.entries(lessons.holdoutByBrochure).map(([id,rows])=>[id,{
 baseline:evaluateProductPolicy(policyForModel(baseline),rows),
 previousArchive:previousArchive?evaluateProductPolicy(policyForModel(previousArchive),rows):null,
 candidate:evaluateProductPolicy(policyForModel(candidate),rows),
}]));
const archiveGate=archiveReleaseGate(Object.fromEntries(Object.entries(byBrochure).map(([id,m])=>[id,{
 reference:(m.previousArchive??m.baseline).all,candidate:m.candidate.all,
}])));
const evaluation = {
  datasetFingerprint:lessons.fingerprint,
  pages:lessons.pages,products:lessons.products,uniqueProducts:lessons.uniqueProducts,
  additionalAuthoredScope:{curriculum:scope?.curriculum.length??0,control:scope?.control.length??0,fingerprint:scope?.fingerprint??null},
  supportedIntents:candidate.report.supportedIntents,
  comparison:previousArchive?"previousArchive":"baseline",
  retailerSummary:Object.fromEntries(Object.entries(lessons.byRetailer).map(([id,r])=>[id,{
    sourceIds:r.sourceIds,trainProducts:r.trainProducts.length,trainExamples:r.train.length,
    trainPositive:r.train.filter(x=>x.positive).length,holdoutProducts:r.holdoutProducts.length,
    holdoutExamples:r.holdout.length,holdoutPositive:r.holdout.filter(x=>x.positive).length,
  }])),
  previousArchive:previousArchive?{id:previousArchive.id,eligible:previousArchive.report.eligible,
    control:previousArchive.report.deployment!.control.all}:null,
  newIntentValidation:Object.fromEntries(["Fisch","Wurst"].map(intent=>[intent,{
    supported:candidate.report.supportedIntents.includes(intent),
    trusted:candidate.report.deployment!.trustedValidation.all.perIntent[intent]??null,
    control:candidate.report.deployment!.control.all.perIntent[intent]??null,
  }])),
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
  archiveReleaseGate:archiveGate,
  experimentQualified:candidate.report.eligible&&archiveGate.passed,
  archiveHoldoutByBrochure:byBrochure,
  archiveHoldoutByRetailer:Object.fromEntries(Object.entries(lessons.byRetailer).map(([id,r])=>[id,r.holdout.length?{
    baseline:evaluateProductPolicy(policyForModel(baseline),r.holdout),
    previousArchive:previousArchive?evaluateProductPolicy(policyForModel(previousArchive),r.holdout):null,
    candidate:evaluateProductPolicy(policyForModel(candidate),r.holdout),
  }:null])),
  archiveHoldout:{previousArchive:previousArchive?evaluateProductPolicy(policyForModel(previousArchive),lessons.holdout):null,baseline:evaluateProductPolicy(policyForModel(baseline),lessons.holdout),
    candidate:evaluateProductPolicy(policyForModel(candidate),lessons.holdout)},
  activated:false,productionDatabaseAccessed:false,
  warning:"Small assistant-curated pilot, not independent ground truth or a production accuracy estimate. Release eligibility compares only the isolated authored baseline, not the VPS active model. Holdout labels never select weights, epochs or scope.",
};
await mkdir(resolve(outputPath));
for(const [name,value] of [["baseline.json",baseline],["candidate.json",candidate],["evaluation.json",evaluation]] as const)
  await writeFile(resolve(outputPath,name),JSON.stringify(value,null,2)+"\n",{flag:"wx"});
if(previousArchive)await writeFile(resolve(outputPath,"previous-archive.json"),JSON.stringify(previousArchive,null,2)+"\n",{flag:"wx"});
await writeFile(resolve(outputPath,"control-errors.json"),JSON.stringify(inspectControlFailures(candidate,datasets.candidate.test),null,2)+"\n",{flag:"wx"});
await writeFile(resolve(outputPath,"holdout-decisions.jsonl"),holdoutDecisions.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx"});
await writeFile(resolve(outputPath,"training-examples.jsonl"),lessons.train.map(row=>JSON.stringify(row)).join("\n")+"\n",{flag:"wx"});
console.log(JSON.stringify(evaluation,null,2));
