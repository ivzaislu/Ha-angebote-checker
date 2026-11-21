import test from "node:test";
import assert from "node:assert/strict";
import { parseArchiveScope, prepareArchiveExperiment, preparePreviousArchiveDataset, archiveReleaseGate } from "./archive-experiment.ts";
import { newProductNet, type ProductExample } from "./product-net.ts";
import { trainProductModel, evaluateTrainedProduct } from "./product-training.ts";
import type { ProductModelPackage } from "./product-model-store.ts";
const row=(name:string,intent="Fisch",positive=true):ProductExample=>({name,intent,positive,source:"curated",category:"Fisch",description:"natur"});
const source={origin:"authored-scope-cases",curriculum:[row("Lernfisch"),row("Lernschokolade","Fisch",false),row("Lernbratwurst","Wurst"),row("Lernpizza","Wurst",false)],control:[row("Prüffisch"),row("Prüfgarnele","Fisch",false),row("Prüfwurst","Wurst"),row("Prüfrohes Fleisch","Wurst",false)]};
test("explicit authored scope remains curated and requires both classes in learning and controls",()=>{
 const s=parseArchiveScope(JSON.stringify(source));assert.equal(s.control.length,4);assert.ok(s.curriculum.every(r=>r.source==="curated"));
 assert.throws(()=>parseArchiveScope(JSON.stringify({...source,curriculum:source.curriculum.filter(r=>r.intent!=="Wurst")})),/Neue Suchanfragen/);
 assert.throws(()=>parseArchiveScope(JSON.stringify({...source,origin:"automatic"})),/Herkunft/);
 assert.throws(()=>parseArchiveScope(JSON.stringify({...source,curriculum:[{...source.curriculum[0],source:"human"}]})),/Ungültiger/);
});
test("source holdout and added author controls are excluded from every training/validation row",()=>{
 const scope=parseArchiveScope(JSON.stringify(source));const held=row("Archiv Zurückgehalten");
 const base={curriculum:[row("Grundwissen"),held],control:[row("Alte Kontrolle")]};
 const lessons={train:[row("Neue Archivlektion")],holdout:[held]};
 const d=prepareArchiveExperiment(base,lessons,scope);
 assert.ok([...d.candidate.train,...d.candidate.validation].every(r=>![held.name,...scope.control.map(x=>x.name),"Alte Kontrolle"].includes(r.name)));
 const changed=prepareArchiveExperiment(base,{...lessons,holdout:[{...held,positive:false}]},{...scope,control:scope.control.map(r=>({...r,positive:!r.positive}))});
 assert.deepEqual(d.candidate.train,changed.candidate.train);assert.deepEqual(d.candidate.validation,changed.candidate.validation);
 assert.throws(()=>prepareArchiveExperiment(base,{...lessons,train:[held]},scope),/dürfen nicht trainiert/);
});
test("offline pretraining initialization is independent of the reference release-control outcome",()=>{
 const yes=row("Bio Vollmilch","Milch"),no={...row("Feinwaschmittel","Milch",false),category:"Waschmittel"};
 const data={train:[yes,no],validation:[yes,no],test:[yes,no],fingerprint:"unit",conflicts:0,sources:{curated:4}};
 const net=newProductNet();net.featureVersion=3;
 const reference:ProductModelPackage={id:"offline-reference",net,report:{...evaluateTrainedProduct(net,data,{epochs:0,bestEpoch:0}),eligible:false}};
 const first=trainProductModel(data,{champion:reference,initialization:{id:reference.id,net}});
 const second=trainProductModel({...data,test:data.test.map(r=>({...r,positive:!r.positive}))},{champion:{...reference,report:{...reference.report,eligible:true}},initialization:{id:reference.id,net}});
 assert.equal(first.report.learning?.mode,"warm-start");assert.deepEqual(first.net,second.net);
 assert.equal(first.report.bestEpoch,second.report.bestEpoch);
 assert.throws(()=>trainProductModel(data,{initialization:{id:"legacy",net:{...net,featureVersion:undefined}}}),/feature-schema-3/);
});

test("previous archive replay cannot recycle earlier holdouts or silently alter their answers",()=>{
 const scope=parseArchiveScope(JSON.stringify(source));
 const held=row("Schon gemessener Fisch"),lesson=row("Frühere Archivlektion");
 const base={curriculum:[row("Grundwissen")],control:[row("Alte Kontrolle")]};
 const previous={train:[lesson],holdout:[held]};
 const current={train:[lesson,row("Neue Lektion")],holdout:[held]};
 const d=preparePreviousArchiveDataset(base,current,previous,scope);
 assert.ok([...d.train,...d.validation].every(r=>r.name!==held.name&&r.name!=="Neue Lektion"));
 assert.throws(()=>preparePreviousArchiveDataset(base,{...current,holdout:[{...held,positive:false}]},previous,scope),/Prüfantworten/);
 assert.throws(()=>preparePreviousArchiveDataset(base,{...current,train:[]},previous,scope),/unveränderter Teil/);
});

test("final archive gate blocks a regression in one brochure even when other stores improve",()=>{
 const result=archiveReleaseGate({old:{reference:{fp:0,fn:3,count:56},candidate:{fp:0,fn:4,count:56}},new:{reference:{fp:0,fn:3,count:26},candidate:{fp:0,fn:0,count:26}}});
 assert.equal(result.passed,false);assert.match(result.reasons[0],/old: Mehr übersehene/);
 assert.equal(archiveReleaseGate({same:{reference:{fp:0,fn:1,count:5},candidate:{fp:0,fn:1,count:5}}}).passed,true);
});
