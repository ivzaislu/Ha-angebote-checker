import test from "node:test";
import assert from "node:assert/strict";
import { gatherLessons } from "./corpus.server.ts";
import type { ArchiveOffer } from "./offer-archive.ts";

test("collector archives full search and current/older leaflet offers; upstream failures are reported", async () => {
  const original = globalThis.fetch;
  const captured: ArchiveOffer[] = [];
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/offers/search")) return Response.json({results: [{id:1,name:"Milch",price:1.29,retailerName:"Shop",validTo:"2026-11-21"}]});
    if (url.includes("/industries")) return Response.json({results:[{name:"Supermarkt",leafletFlights:[
      {mainLeafletId:2,offerCount:2,validFrom:"2099-01-01"},
      {mainLeafletId:3,offerCount:1,validFrom:"2020-01-01"},
      {mainLeafletId:2,offerCount:2},
    ]}]});
    if (url.includes("/leaflets/")) return Response.json({children:[{id:"offers/42"},{id:""},{id:"not-an-offer"}]});
    if (url.includes("/offers/42")) return Response.json({name:"Räucherlachs",description:"200 g",price:2.99,retailerName:"Shop"});
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const lessons = await gatherLessons("10115",undefined,async offers => { captured.push(...offers); });
    assert.ok(lessons.length > 0);
    assert.ok(captured.some(r => r.id === 42 && r.price === 2.99 && r.description === "200 g"));
    assert.ok(captured.some(r => r.id === 1 && r.validTo === "2026-11-21"));
    assert.equal(calls.filter(url=>url.includes("/leaflets/")).length,2);
    assert.equal(calls.filter(url=>url.includes("/offers/42")).length,1);
    globalThis.fetch = async () => new Response("Unavailable",{status:503});
    await assert.rejects(gatherLessons("10115"),/503/);
  } finally { globalThis.fetch = original; }
});
