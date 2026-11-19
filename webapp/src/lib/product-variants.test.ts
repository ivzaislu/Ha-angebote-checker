import { test } from "node:test";
import { strict as assert } from "node:assert";
import { compatibleSalmon, salmonVariant } from "./product-variants.ts";

test("different salmon-like products are distinguished", () => {
  assert.equal(salmonVariant("Seelachsfilet"), "pollock");
  assert.equal(salmonVariant("Räucherlachs"), "smoked-salmon");
  assert.equal(salmonVariant("Lachsschinken"), "salmon-ham");
  assert.equal(salmonVariant("Lachsforelle"), null);
});
test("salmon queries do not return pollock or ham", () => {
  assert.equal(compatibleSalmon("Lachs", "Seelachsfilet"), false);
  assert.equal(compatibleSalmon("Lachs", "Lachsschinken"), false);
  assert.equal(compatibleSalmon("Lachs", "Lachsfilet"), true);
  assert.equal(compatibleSalmon("Räucherlachs", "Lachsfilet"), false);
  assert.equal(compatibleSalmon("Seelachs", "Seelachsfilet"), true);
});
