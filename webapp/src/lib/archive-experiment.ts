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
