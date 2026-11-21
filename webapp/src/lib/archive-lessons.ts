import { createHash } from "node:crypto";
import { exactQueryFor } from "./exact.ts";
import { exampleKey, productGroup } from "./product-training.ts";
import type { ProductExample } from "./product-net.ts";

export type RetailerLessons = {train:ProductExample[];holdout:ProductExample[];trainProducts:string[];holdoutProducts:string[];sourceIds:string[]};
type PageEvidence = { sourceUrl: string; ocrSha256: string; imageSha256: string; brochureId: string };
export function parseArchiveLessons(content: string, pagesContent: string) {
  if (Buffer.byteLength(content) > 10_000_000 || Buffer.byteLength(pagesContent) > 15_000_000)
    throw new Error("Archivdatei ist zu groß");
  const pages = new Map<string, PageEvidence>();
  for (const line of pagesContent.split(/\r?\n/).filter(line => line.trim())) {
    const row = JSON.parse(line);
    if (!row || row.provider !== "angebote.com" || !validSource(row.sourceUrl) ||
        !hash(row.ocrSha256) || !hash(row.imageSha256) || row.brochureId !== brochureKey(row.sourceUrl) ||
        typeof row.ocrText !== "string" || sha(row.ocrText) !== row.ocrSha256)
      throw new Error("Ungültiger Seitenbeleg");
    if (pages.has(row.sourceUrl)) throw new Error("Doppelter Seitenbeleg");
    pages.set(row.sourceUrl,row);
  }
  const train: ProductExample[] = [], holdout: ProductExample[] = [];
  const keys = new Set<string>(), brochures = new Map<string,string>();
  const groups = new Map<string,string>();
  const holdoutByBrochure: Record<string,ProductExample[]> = {};
  const byRetailer:Record<string,RetailerLessons> = {};
  let products = 0;
  for (const line of content.split(/\r?\n/).filter(line => line.trim())) {
    const row = JSON.parse(line), evidence = pages.get(row?.sourceUrl);
    if (!evidence || row.annotationStatus !== "assistant-curated" ||
        !["train","holdout"].includes(row.partition) ||
        row.ocrSha256 !== evidence.ocrSha256 || row.imageSha256 !== evidence.imageSha256 ||
        typeof row.name !== "string" || row.name.trim().length < 3 || row.name.length > 180 ||
        typeof row.category !== "string" || !row.category.trim() || row.category.length > 180 ||
        typeof row.description !== "string" || row.description.length > 600 ||
        !Array.isArray(row.judgments) || !row.judgments.length || row.judgments.length > 72)
      throw new Error("Nicht geprüfte oder veränderte Archivannotation");
    const previous = brochures.get(evidence.brochureId);
    if (previous && previous !== row.partition) throw new Error("Ein Prospekt darf nicht in Training und Prüfung liegen");
    brochures.set(evidence.brochureId,row.partition);
    const nameGroup = productGroup({...row,intent:"",positive:false,source:"curated"});
    if (groups.has(nameGroup) && groups.get(nameGroup) !== row.partition)
      throw new Error("Ein Produktname darf nicht in Training und Prüfung liegen");
    groups.set(nameGroup,row.partition);
    const sourceId=evidence.brochureId.split(":")[0];
    const retailer=["aldi-nord","aldi-sued","aldi-sud"].includes(sourceId)?"aldi":sourceId;
    const retail=byRetailer[retailer]??={train:[],holdout:[],trainProducts:[],holdoutProducts:[],sourceIds:[]};
    if(!retail.sourceIds.includes(sourceId))retail.sourceIds.push(sourceId);
    const names=row.partition==="train"?retail.trainProducts:retail.holdoutProducts;
    if(!names.includes(nameGroup))names.push(nameGroup);
    for (const judgment of row.judgments) {
      const query = typeof judgment.intent === "string" ? exactQueryFor(judgment.intent) : null;
      if (!query || typeof judgment.positive !== "boolean") throw new Error("Ungültige Produktbewertung");
      const example: ProductExample = {name:row.name.trim(),category:row.category.trim(),description:row.description.trim(),
        intent:query.query,positive:judgment.positive,source:"curated"};
      const key = exampleKey(example);
      if (keys.has(key)) throw new Error("Doppelte oder widersprüchliche Produktbewertung");
      keys.add(key);
      (row.partition === "train" ? train : holdout).push(example);
      (row.partition === "train" ? retail.train : retail.holdout).push(example);
      if(row.partition === "holdout") (holdoutByBrochure[evidence.brochureId]??=[]).push(example);
    }
    if (++products > 1000) throw new Error("Der Pilotlauf erlaubt höchstens 1000 Produkte");
  }
  if (!train.length || !holdout.length) throw new Error("Trainings- und zurückgehaltene Archivbeispiele sind erforderlich");
  return {train,holdout,products,uniqueProducts:groups.size,pages:pages.size,holdoutByBrochure,byRetailer,fingerprint:sha(content)};
}
function sha(text:string):string { return createHash("sha256").update(text).digest("hex"); }
function hash(value:unknown):value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function validSource(value:unknown):value is string {
  return typeof value === "string" && /^https:\/\/angebote\.com\/[a-z0-9-]+\/woche-\d+-ab-\d{2}-\d{2}-\d{4}-bis-\d{2}-\d{2}-\d{4}-seite-\d+-[a-z0-9]+$/.test(value);
}

function brochureKey(url:string):string {
  const m=/^https:\/\/angebote\.com\/([a-z0-9-]+)\/woche-\d+-ab-(\d{2})-(\d{2})-(\d{4})-bis-(\d{2})-(\d{2})-(\d{4})-seite-\d+-([a-z0-9]+)$/.exec(url)!;
  return `${m[1]}:${m[4]}-${m[3]}-${m[2]}:${m[7]}-${m[6]}-${m[5]}:${m[8]}`;
}
