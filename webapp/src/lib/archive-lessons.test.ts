import { readFile } from "node:fs/promises";
import { COUNTRIES } from "./catalog.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseArchiveLessons } from "./archive-lessons.ts";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const url=(n:number)=>`https://angebote.com/lidl/woche-${n}-ab-01-0${n}-2025-bis-07-0${n}-2025-seite-1-abc`;
const pages=[1,2].map(n=>({provider:"angebote.com",sourceUrl:url(n),ocrText:"Milch",ocrSha256:sha("Milch"),imageSha256:sha("image"),brochureId:`lidl:2025-0${n}-01:2025-0${n}-07:abc`}));
const rows=[1,2].map(n=>({sourceUrl:url(n),name:`Vollmilch ${n}`,category:"Milch",description:"1 l",ocrSha256:sha("Milch"),imageSha256:sha("image"),annotationStatus:"assistant-curated",partition:n===1?"train":"holdout",judgments:[{intent:"Milch",positive:true}]}));
const jsonl=(v:unknown[])=>v.map(x=>JSON.stringify(x)).join("\n");
test("source-bound author annotations remain curated and independent brochures stay held out",()=>{
  const r=parseArchiveLessons(jsonl(rows),jsonl(pages));
  assert.equal(r.train.length,1);assert.equal(r.holdout.length,1);assert.equal(r.train[0].source,"curated");
  assert.equal(r.products,2);assert.equal(r.uniqueProducts,2);
  assert.equal(Object.keys(r.holdoutByBrochure).length,1);
  assert.equal(r.byRetailer.lidl.trainProducts.length,1);
  assert.equal(r.byRetailer.lidl.holdoutProducts.length,1);
  assert.equal(Object.hasOwn(r.train[0],"retailer"),false,"Retailers are audit metadata, not classifier inputs");
});
test("unreviewed OCR, changed evidence and unknown intents cannot become labels",()=>{
  for(const changed of [{annotationStatus:"unreviewed"},{ocrSha256:sha("changed")},{imageSha256:sha("changed")},{judgments:[{intent:"invented",positive:true}]}]) {
    assert.throws(()=>parseArchiveLessons(jsonl([{...rows[0],...changed},rows[1]]),jsonl(pages)));
  }
  assert.throws(()=>parseArchiveLessons(jsonl(rows),jsonl([{...pages[0],ocrText:"changed"},pages[1]])));
});
test("duplicate labels and shared product/brochure groups cannot leak into holdout",()=>{
  assert.throws(()=>parseArchiveLessons(jsonl([rows[0],...rows]),jsonl(pages)),/Doppelte/);
  assert.throws(()=>parseArchiveLessons(jsonl([rows[0],{...rows[1],name:rows[0].name}]),jsonl(pages)),/Produktname/);
  const sameUrl=url(1).replace('-seite-1-','-seite-2-');
  assert.throws(()=>parseArchiveLessons(jsonl([rows[0],{...rows[1],sourceUrl:sameUrl}]),jsonl([pages[0],{...pages[0],sourceUrl:sameUrl}])),/Prospekt/);
});

test("Aldi Nord and Süd share retailer reporting while their brochure identities stay separate",()=>{
 const p=pages.map((r,i)=>({...r,sourceUrl:r.sourceUrl.replace('/lidl/',i?'/aldi-sued/':'/aldi-nord/'),brochureId:r.brochureId.replace('lidl:',i?'aldi-sued:':'aldi-nord:')}));
 const a=rows.map((r,i)=>({...r,sourceUrl:p[i].sourceUrl}));
 const out=parseArchiveLessons(jsonl(a),jsonl(p));
 assert.deepEqual(out.byRetailer.aldi.sourceIds,["aldi-nord","aldi-sued"]);
 assert.equal(out.byRetailer.aldi.trainProducts.length,1);assert.equal(out.byRetailer.aldi.holdoutProducts.length,1);
});

test("German retailer coverage includes NKD and distinguishes missing provider archives from actual stores",async()=>{
 const coverage=JSON.parse(await readFile(new URL("../../../training/angebote/multistore-coverage.json",import.meta.url),"utf8"));
 assert.deepEqual(coverage.retailers.map((r:{retailer:string})=>r.retailer).sort(),[...COUNTRIES.de.retailers].sort());
 const nkd=coverage.retailers.find((r:{id:string})=>r.id==="nkd");assert.ok(nkd.trainProducts>0&&nkd.holdoutProducts>0);
 for(const r of coverage.retailers.filter((r:{sourceStatus:string})=>r.sourceStatus==="unavailable")){
  assert.equal(r.sourcePages,0);assert.equal(r.annotatedProducts,0);assert.match(r.error,/404/);
 }
});
