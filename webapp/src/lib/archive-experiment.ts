import { createHash } from "node:crypto";
import type { ProductExample } from "./product-net.ts";
import { exactQueryFor } from "./exact.ts";
import { exampleKey, productGroup, prepareProductDataset } from "./product-training.ts";

export type ScopeCases = {curriculum:ProductExample[];control:ProductExample[];fingerprint:string};
export function parseArchiveScope(content:string):ScopeCases {
  if(Buffer.byteLength(content)>1_000_000)throw new Error("Zu viele zusätzliche Lernfälle");
  const value=JSON.parse(content);
  if(value?.origin!=="authored-scope-cases" || !Array.isArray(value.curriculum) || !Array.isArray(value.control))
    throw new Error("Zusätzliche Lernfälle benötigen eine explizite Herkunft");
  const parse=(rows:unknown[]):ProductExample[]=>{
    if(rows.length>1000)throw new Error("Zu viele zusätzliche Lernfälle");
    const keys=new Set<string>();
    return rows.map((input)=>{
      const r=input as ProductExample;
      if(!r || !["Fisch","Wurst"].includes(r.intent) || !exactQueryFor(r.intent) || r.source!=="curated" ||
        typeof r.name!=="string" || r.name.trim().length<3 || r.name.length>180 ||
        typeof r.category!=="string" || r.category.length>180 || typeof r.description!=="string" || r.description.length>600 ||
        typeof r.positive!=="boolean")throw new Error("Ungültiger zusätzlicher Lernfall");
      const row={intent:r.intent,name:r.name.trim(),category:r.category.trim(),description:r.description.trim(),positive:r.positive,source:"curated" as const};
      const key=exampleKey(row);if(keys.has(key))throw new Error("Doppelte zusätzliche Bewertung");keys.add(key);return row;
    });
  };
  const curriculum=parse(value.curriculum),control=parse(value.control);
  const held=new Set(control.map(productGroup));
  if(curriculum.some(r=>held.has(productGroup(r))))throw new Error("Zusätzliche Kontrollprodukte dürfen nicht trainiert werden");
  for(const intent of ["Fisch","Wurst"]){
    if(!curriculum.some(r=>r.intent===intent&&r.positive) || !curriculum.some(r=>r.intent===intent&&!r.positive) ||
      !control.some(r=>r.intent===intent&&r.positive) || !control.some(r=>r.intent===intent&&!r.positive))
      throw new Error("Neue Suchanfragen benötigen positive und negative Lern- und Kontrollfälle");
  }
  return {curriculum,control,fingerprint:createHash("sha256").update(content).digest("hex")};
}
export function prepareArchiveExperiment(
  authored:{curriculum:ProductExample[];control:ProductExample[]},
  lessons:{train:ProductExample[];holdout:ProductExample[]},
  scope:ScopeCases={curriculum:[],control:[],fingerprint:"none"},
){
  const heldGroups=new Set(lessons.holdout.map(productGroup));
  const control=[...authored.control,...scope.control];
  if(control.some(r=>heldGroups.has(productGroup(r))))throw new Error("Archivprüfung und Kontrollsatz überschneiden sich");
  const base=authored.curriculum.filter(r=>!heldGroups.has(productGroup(r)));
  const extra=[...lessons.train,...scope.curriculum];
  if(extra.some(r=>heldGroups.has(productGroup(r))))throw new Error("Archivprüfprodukte dürfen nicht trainiert werden");
  return {baseline:prepareProductDataset(base,control),candidate:prepareProductDataset([...base,...extra],control)};
}

/** Replay the fixed prior archive without ever reusing a measured holdout for training. */
export function preparePreviousArchiveDataset(
 authored:{curriculum:ProductExample[];control:ProductExample[]},
 current:{train:ProductExample[];holdout:ProductExample[]},
 previous:{train:ProductExample[];holdout:ProductExample[]},scope:ScopeCases,
){
 const held=new Map(current.holdout.map(r=>[exampleKey(r),r.positive]));
 if(previous.holdout.some(r=>held.get(exampleKey(r))!==r.positive))
   throw new Error("Frühere Prüfantworten müssen unverändert zurückgehalten bleiben");
 const heldGroups=new Set(current.holdout.map(productGroup));
 const trainKeys=new Map(current.train.map(r=>[exampleKey(r),r.positive]));
 const train=previous.train.filter(r=>!heldGroups.has(productGroup(r)));
 if(train.some(r=>trainKeys.get(exampleKey(r))!==r.positive))
   throw new Error("Die frühere Trainingsreferenz ist kein unveränderter Teil der neuen Partie");
 return prepareArchiveExperiment(authored,{train,holdout:current.holdout},scope).candidate;
}

/** Final experiment gate only; never used to pick weights, epochs, or scope. */
export function archiveReleaseGate(cohorts:Record<string,{
 reference:{fp:number;fn:number;count:number};candidate:{fp:number;fn:number;count:number};
}>) {
 const reasons:string[]=[];
 for(const [id,{reference,candidate}] of Object.entries(cohorts)){
  if(reference.count!==candidate.count)reasons.push(`${id}: Unterschiedliche Prüfumfänge`);
  if(candidate.fp>reference.fp)reasons.push(`${id}: Mehr falsche Treffer (${candidate.fp} statt ${reference.fp})`);
  if(candidate.fn>reference.fn)reasons.push(`${id}: Mehr übersehene Treffer (${candidate.fn} statt ${reference.fn})`);
 }
 return {passed:reasons.length===0,reasons};
}
