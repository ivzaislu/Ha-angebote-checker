import test from "node:test";
import assert from "node:assert/strict";
import { RULE_CASES } from "./exact-cases.ts";
import { exactQueryFor, offerFits } from "./exact.ts";
import { matchesProduct } from "./product-matching.ts";

for (const row of RULE_CASES) {
  test(`${row.expected ? "accept" : "reject"}: ${row.query} → ${row.name} [${row.category}] ${row.description}`, () => {
    assert.equal(offerFits(row.query,row.name,row.description,row.category),row.expected);
    assert.equal(matchesProduct({intent:row.query,name:row.name,description:row.description,category:row.category}),row.expected);
  });
}
test("title aliases do not turn a specific product query into a broader family",()=>{
  assert.equal(exactQueryFor("Kochschinken"),null);
  assert.equal(exactQueryFor("Seelachsfilet"),null);
  assert.equal(exactQueryFor("Wildlachs"),null);
  assert.equal(exactQueryFor("Naturjoghurt"),null);
  assert.equal(exactQueryFor("Weidemilch"),null);
  assert.equal(exactQueryFor("  Feuchtes   Toilettenpapier ")?.query,"Feuchtes Toilettenpapier");
});
