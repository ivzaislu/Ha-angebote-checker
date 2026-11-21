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
  assert.equal(r.products,2);
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
