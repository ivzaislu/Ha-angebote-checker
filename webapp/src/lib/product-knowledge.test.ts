import { test } from "node:test";
import { strict as assert } from "node:assert";
import { productKey, rankSuggestions, safePrice, validProductName } from "./product-knowledge.ts";
test("German names normalize consistently", () => {
  assert.equal(productKey(" LACHS-Filet "), "lachs filet");
  assert.equal(productKey("Straße"), "strasse");
});
test("prefix autocomplete prioritizes starts and frequency", () => {
  const rows = [{name:"Räucherlachs",seen:100},{name:"Lachsfilet",seen:3},{name:"Lachssteak",seen:7}];
  assert.deepEqual(rankSuggestions(rows,"la").map(x=>x.name), ["Lachssteak","Lachsfilet","Räucherlachs"]);
});
test("invalid prices and product names are rejected", () => {
  assert.equal(safePrice("-1"),null);
  assert.equal(safePrice("4,99"),4.99);
  assert.equal(validProductName("  "),false);
});
