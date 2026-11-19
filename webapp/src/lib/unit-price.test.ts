import { test } from "node:test";
import { strict as assert } from "node:assert";
import { inferUnitPrice } from "./unit-price.ts";
test("single weight is converted to kilograms", () => {
  assert.deepEqual(inferUnitPrice("Lachs 250 g", 4.99), {unit:"kg",quantity:0.25,perUnit:19.96});
});
test("multipacks are converted to liters", () => {
  assert.deepEqual(inferUnitPrice("Milch 6 x 1 l", 5.94), {unit:"l",quantity:6,perUnit:0.99});
});
test("ambiguous weights and missing prices are not compared", () => {
  assert.equal(inferUnitPrice("Lachs 200-300 g", 4.99), null);
  assert.equal(inferUnitPrice("Lachs 250 g / 500 g", 4.99), null);
  assert.equal(inferUnitPrice("Lachs 250 g", null), null);
});
