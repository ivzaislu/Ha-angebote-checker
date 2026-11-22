import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { archiveOffers, type ArchiveOffer } from "./offer-archive.ts";
import { currentArchivedOffer, savedOffers } from "./offer-cache.ts";

const now = new Date("2026-11-19T12:00:00Z");
const fresh = "2026-11-19T10:00:00Z";
const query = {country:"de" as const,zip:"73431",query:"Milch",retailers:[] as string[]};

test("cache reads only the latest matching current state in the requested region/country", async () => {
  const db = new PGlite();
  try {
    for (const name of ["0002_product_knowledge.sql","0003_offer_archive.sql"]) {
      await db.exec(await readFile(new URL(`../../migrations/${name}`,import.meta.url),"utf8"));
    }
    const sql = {query:async <T>(text:string,params?:unknown[]):Promise<T[]> => (await db.query<T>(text,params)).rows};
    const base: ArchiveOffer = {id:1,name:"Frische Milch",description:"Bio 1 l",price:"1,29",retailerName:"Shop",validFrom:"2026-11-16",validTo:"2026-11-22"};
    await archiveOffers(sql,"de","73431",[base,{...base,id:2,name:"Buttermilch"},{...base,id:3,name:"Haferdrink"},{...base,id:4,validTo:"2026-11-18"},{...base,id:5,validFrom:"2026-11-20"},{...base,id:6,price:null}]);
    await archiveOffers(sql,"de","10115",[{...base,price:0.99}]);
    await archiveOffers(sql,"at","1010",[{...base,price:0.59}]);
    await sql.query("update offer_archive set observed_at=$1",["2026-11-18T08:00:00Z"]);
    await archiveOffers(sql,"de","73431",[{...base,price:1.79}]);
    await sql.query("update offer_archive set observed_at=$1 where country='de' and zip='73431' and offer_id='1' and price=1.79",[fresh]);
    const found = await savedOffers(sql,query,now);
    assert.equal(found.length,1);
    assert.equal(found[0].price,1.79);
    assert.equal((await savedOffers(sql,{...query,retailers:["Other"]},now)).length,0);
    assert.equal((await savedOffers(sql,{...query,zip:"99999"},now)).length,0);
    assert.equal((await savedOffers(sql,{...query,query:"Hafermilch"},now))[0].name,"Haferdrink");
    // A renamed/expired latest record cannot resurrect an older matching offer.
    await archiveOffers(sql,"de","73431",[{...base,price:2.29,validTo:"2026-11-18"}]);
    assert.equal((await savedOffers(sql,query,now)).length,0);
    // Missing expiry is fresh only for 24h; an unknown price does not mask a remote lookup.
    await archiveOffers(sql,"de","73431",[{...base,id:7,validFrom:undefined,validTo:undefined}]);
    await sql.query("update offer_archive set observed_at=$1 where offer_id='7'",[fresh]);
    assert.equal((await savedOffers(sql,query,now))[0].price,1.29);
    const tomorrow = await savedOffers(sql,query,new Date("2026-11-20T12:00:00Z"));
    assert.deepEqual(tomorrow.map(offer=>offer.id),[5]); // Only the formerly future offer is now current.
  } finally {await db.close();}
});

test("validity handles local end-of-day, multiple windows and malformed/missing dates", () => {
  assert.ok(currentArchivedOffer({validTo:"2026-11-19"},fresh,"de",new Date("2026-11-19T22:59:59Z")));
  assert.equal(currentArchivedOffer({validTo:"2026-11-19"},fresh,"de",new Date("2026-11-19T23:00:00Z")),null);
  assert.equal(currentArchivedOffer({validTo:"2026-02-31"},fresh,"de",now),null);
  assert.equal(currentArchivedOffer({},"bad date","de",now),null);
  assert.equal(currentArchivedOffer({},"2026-11-20T10:00:00Z","de",now),null);
  const result = currentArchivedOffer({validityDates:[{to:"2026-11-18"},{from:"2026-11-19",to:"2026-11-25"}]},fresh,"de",now);
  assert.deepEqual(result?.validityDates,[{from:"2026-11-19",to:"2026-11-25"}]);
});
