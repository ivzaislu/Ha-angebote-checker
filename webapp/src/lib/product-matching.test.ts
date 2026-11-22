import test from "node:test";
import assert from "node:assert/strict";
import { productMatchingMode, searchProductModel, scanMatchesMode } from "./product-matching.ts";
import { decideProduct } from "./product-policy.ts";
import { newProductNet } from "./product-net.ts";
import type { ProductModelPackage } from "./product-model-store.ts";

test("rules are the default even when a stored network would reject a matching product", async () => {
  const net = newProductNet();
  net.w1.fill(0); net.w2.fill(0); net.b2 = -20;
  const model = { id:"saved", net, report:{eligible:true,supportedIntents:["Milch"],vocabulary:["vollmilch"]} } as ProductModelPackage;
  const row = {intent:"Milch",name:"Vollmilch",category:"Milch",description:"1 l"};
  assert.equal(decideProduct(model,row).keep,false,"fixture must actually reject through the network");
  let reads=0;
  const load=async()=>{reads++;return model;};
  for(const value of [undefined,"","rules","NEURAL","typo"]){
    assert.equal(productMatchingMode(value),"rules");
    const chosen=await searchProductModel(load,value);
    assert.equal(chosen,null);
    assert.deepEqual(decideProduct(chosen,row),{keep:true,fromBrain:false,score:null,modelId:null});
    assert.equal(decideProduct(chosen,{intent:"Salat",name:"Creme",category:"Gesichtspflege",description:"200 ml"}).keep,false);
  }
  assert.equal(reads,0,"rules search never loads saved weights");
  assert.equal(await searchProductModel(load,"neural"),model);
  assert.equal(reads,1);
  assert.equal(await searchProductModel(async()=>null,"neural"),null);
});

test("legacy or other-mode results are not presented as a current rules scan",()=>{
  assert.equal(scanMatchesMode({},"rules"),false);
  assert.equal(scanMatchesMode({matchingMode:"neural"},"rules"),false);
  assert.equal(scanMatchesMode({matchingMode:"rules"},"rules"),true);
  assert.equal(scanMatchesMode({matchingMode:"rules"},"neural"),false);
  assert.equal(scanMatchesMode({matchingMode:"neural"},"neural"),true);
  assert.equal(scanMatchesMode({matchingMode:"rules"},undefined),false);
});
