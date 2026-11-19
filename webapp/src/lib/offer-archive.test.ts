import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { archiveOffers, archiveRecord, priceHistory, prepareTrainingData, type TrainingSource } from "./offer-archive.ts";
import { recognizeVariant } from "./product-variants.ts";

const offer = { id: 17, name: "Frische Milch", description: "Bio 1,5% Fett 1 l", price: "1,29", retailerName: "Test", validFrom: "2026-11-16", validTo: "2026-11-21" };

test("snapshots preserve corrections, regions and countries without duplicating identical scans", async () => {
  const db = new PGlite();
  try {
    for (const file of ["0001_offer_brain.sql", "0002_product_knowledge.sql", "0003_offer_archive.sql"]) {
      await db.exec(await readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8"));
    }
    const sql = { query: async <T>(text: string, params?: unknown[]): Promise<T[]> => (await db.query<T>(text,params)).rows };
    assert.equal(await archiveOffers(sql,"de","10115",[offer,offer]),1);
    assert.equal(await archiveOffers(sql,"de","10115",[offer]),0);
    await archiveOffers(sql,"de","10115",[{...offer, price: 1.79}]);
    await archiveOffers(sql,"de","20095",[{...offer, price: 0.99}]);
    await archiveOffers(sql,"at","1010",[{...offer, price: 0.59}]);
    await archiveOffers(sql,"de","10115",[{...offer,id: 18,price: null}]);
    const all = await priceHistory(sql,"de",offer.name);
    assert.equal(Number(all.minimum),0.99);
    assert.equal(Number(all.maximum),1.79);
    assert.equal(all.observations,3);
    assert.deepEqual(all.rows.map(r=>Number(r.price)),[0.99,1.29,1.79]);
    assert.equal(all.truncated,false);
    assert.equal(Number(all.rows[1].unit_price),1.29);
    const local = await priceHistory(sql,"de",offer.name,"10115");
    assert.equal(local.observations,2);
    assert.equal(Number(local.minimum),1.29);
    assert.equal(local.rows[0].valid_to,"2026-11-21");
    const payload = await sql.query<{ raw_payload: typeof offer }>("select raw_payload from offer_archive where snapshot_id=$1", [archiveRecord("de","10115",offer)!.snapshotId]);
    assert.deepEqual(payload[0].raw_payload,offer);
    await assert.rejects(archiveOffers(sql,"de","1010",[offer]),/postcode/);
    assert.equal(archiveRecord("de","10115",{name:"Milch"}),null);
    const empty = await priceHistory(sql,"de","Unknown");
    assert.equal(empty.minimum,null);
    assert.equal(empty.observations,0);
    await sql.query(`insert into offer_archive(snapshot_id,country,offer_id,zip,retailer,name,name_key,
      description,category,variant_key,price,valid_from,valid_to,raw_payload)
      select 'bulk-' || n, 'de', n::text, '10115', 'Shop', 'Bulk Milk', 'bulk milk',
      '', '', '{}', n / 100.0, '', '', '{}'::jsonb from generate_series(1,501) n`);
    const bounded = await priceHistory(sql,"de","Bulk Milk");
    assert.equal(bounded.rows.length,500);
    assert.equal(bounded.truncated,true);
    assert.equal(Number(bounded.maximum),5.01);
    assert.equal(bounded.observations,501);
  } finally { await db.close(); }
});

test("unknown variants stay unknown and explicit milk/fish variants remain separate", () => {
  assert.deepEqual(recognizeVariant("Kartoffeln"),{family:null,kind:null,attributes:[]});
  assert.equal(recognizeVariant("Haferdrink").family,"plant-drink");
  assert.equal(recognizeVariant("Buttermilch").family,"buttermilk");
  assert.equal(recognizeVariant("H-Milch").kind,"uht");
  assert.deepEqual(recognizeVariant(offer.name,offer.description).attributes,["fat:1.5%","organic"]);
  assert.equal(recognizeVariant("Seelachsfilet").family,"pollock");
  assert.equal(recognizeVariant("Lachsschinken").family,"pork");
  assert.equal(recognizeVariant("Räucherlachs").kind,"smoked-salmon");
});

test("training export deduplicates regional snapshots, preserves provenance and avoids product split leakage", () => {
  const row: TrainingSource = { snapshot_id:"a",country:"de",offer_id:"17",name:offer.name,description:offer.description,category:"Milch",variant_key:JSON.stringify(recognizeVariant(offer.name)) };
  const examples = prepareTrainingData([row,{...row,snapshot_id:"b"},{...row,snapshot_id:"c",description:"1 l"}]);
  assert.ok(examples.length > 0);
  assert.equal(new Set(examples.map(e=>e.id)).size,examples.length);
  assert.equal(new Set(examples.map(e=>e.split)).size,1);
  assert.ok(examples.every(e=>e.needsReview && e.labelSource === "rules-v1"));
  assert.equal(examples[0].provenance.snapshotId,"a");
  assert.deepEqual(prepareTrainingData([row]),prepareTrainingData([row]));
});
