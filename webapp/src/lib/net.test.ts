import assert from "node:assert/strict";
import { test } from "node:test";
import { applyNetDecision, createNet, predict, trainLessons } from "./net.ts";

test("an untrained net does not override the rules", () => {
  const net = createNet();
  const probability = predict(net, "Gurke", "Snack-Gurken Gemüse");
  assert.ok(probability > 0.2 && probability < 0.8);
  assert.deepEqual(applyNetDecision(false, false, 0.99, net.steps), { keep: false, fromBrain: false });
  assert.deepEqual(applyNetDecision(true, false, 0.01, 0), { keep: true, fromBrain: false });
});

test("training on leaflet titles separates a new cucumber from a lookalike", () => {
  const net = createNet();
  const lessons = [
    { intent: "Gurke", text: "Gurken Gurke", positive: true },
    { intent: "Gurke", text: "Salatgurken Gurke", positive: true },
    { intent: "Gurke", text: "Schlangengurken Gurke", positive: true },
    { intent: "Gurke", text: "Mini-Gurken Gurke", positive: true },
    { intent: "Gurke", text: "Gurktaler Spirituosen", positive: false },
    { intent: "Gurke", text: "Gurkenaufstrich Feinkost", positive: false },
    { intent: "Gurke", text: "Gewürzgurken Konserve", positive: false },
    { intent: "Milch", text: "Frische Milch Milch", positive: true },
    { intent: "Milch", text: "H-Milch Milch", positive: true },
    { intent: "Milch", text: "Buttermilch Milch", positive: false },
  ];
  for (let pass = 0; pass < 8; pass += 1) trainLessons(net, lessons, 1);
  const snack = predict(net, "Gurke", "Snack-Gurken Gemüse");
  const taler = predict(net, "Gurke", "Gurktaler Spirituosen");
  const fresh = predict(net, "Milch", "Frische Milch Milch");
  const butter = predict(net, "Milch", "Buttermilch Milch");
  assert.ok(snack > taler, `snack ${snack} should beat taler ${taler}`);
  assert.ok(snack > 0.7, `snack ${snack}`);
  assert.ok(taler < 0.35, `taler ${taler}`);
  assert.ok(fresh > butter, `milk ${fresh} vs butter ${butter}`);
  assert.equal(applyNetDecision(false, true, 0.99, net.steps).keep, false);
  assert.equal(net.loss < 0.45, true, `loss ${net.loss}`);
});
