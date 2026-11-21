import test from "node:test";
import assert from "node:assert/strict";
import { newProductNet, type ProductExample } from "./product-net.ts";
import { evaluateTrainedProduct } from "./product-training.ts";
import { inspectControlFailures } from "./product-control-diagnostics.ts";
import type { ProductModelPackage } from "./product-model-store.ts";

test("read-only diagnostics reconstruct held-out errors without producing review labels or mutating models", () => {
  const row: ProductExample={intent:"Milch",name:"Kontrollmilch",category:"Milch",description:"1 l",positive:true,source:"curated"};
  const dataset={train:[row],validation:[row],test:[row],fingerprint:"fixture",conflicts:0,sources:{curated:2}};
  const net=newProductNet(); net.featureVersion=3;net.w2.fill(0);net.b2=-20;
  const model: ProductModelPackage={id:"rejected-fixture",net,report:{...evaluateTrainedProduct(net,dataset,{epochs:0,bestEpoch:0}),supportedIntents:["Milch"],vocabulary:["kontrollmilch"]}};
  const original=JSON.stringify(model);
  const result=inspectControlFailures(model,[row]);
  assert.equal(result.available,true);
  assert.equal(result.total,1);
  assert.deepEqual(result.errors,[{intent:row.intent,name:row.name,category:row.category,description:row.description,expected:true,actual:false,fromBrain:true}]);
  assert.equal(JSON.stringify(model),original);
  assert.deepEqual(inspectControlFailures(model,[{...row,positive:false}]),{available:false,total:0,truncated:false,errors:[]});
});
