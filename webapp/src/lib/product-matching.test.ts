import test from "node:test";
import assert from "node:assert/strict";
import { matchesProduct, scanMatchesMode } from "./product-matching.ts";

test("rules accept product variants and reject lookalikes and incompatible categories", () => {
  const row = {intent:"Milch",name:"Vollmilch",category:"Milch",description:"1 l"};
  assert.equal(matchesProduct(row),true);
  assert.equal(matchesProduct({...row,name:"Haferdrink",description:"Hafermilch 1 l"}),false);
  assert.equal(matchesProduct({intent:"Salat",name:"Creme",category:"Gesichtspflege",description:"200 ml"}),false);
  assert.equal(matchesProduct({intent:"Lachs",name:"Lachsschinken",category:"Wurst",description:"100 g"}),false);
  assert.equal(matchesProduct({intent:"Räucherlachs",name:"Räucherlachs",category:"Räucherfisch",description:"200 g"}),true);
});

test("legacy and retired-mode results require a fresh rules check",()=>{
  assert.equal(scanMatchesMode({}),false);
  assert.equal(scanMatchesMode({matchingMode:"neural"}),false);
  assert.equal(scanMatchesMode({matchingMode:"rules"}),true);
  assert.equal(scanMatchesMode(null),false);
});
