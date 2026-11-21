import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { clientId } from "./client-id.ts";

test("HTTP clients can migrate old lists, add/remove products and create lists without randomUUID", async () => {
  const oldCrypto = Object.getOwnPropertyDescriptor(globalThis,"crypto");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis,"window");
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  const values = new Map<string,string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string,value: string) => { values.set(key,value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}});
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:storage});
  Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:storage}});
  try {
    storage.setItem("angebote-v1",JSON.stringify({version:1,state:{items:[{id:"old-item",name:"Butter"}],country:"de",zip:"73431"}}));
    const { useAngebote } = await import("./store.ts");
    await useAngebote.persist.rehydrate();
    let state = useAngebote.getState();
    assert.equal(state.lists[0].items[0].name,"Butter");
    assert.equal(state.zip,"73431");
    assert.equal(state.addItem("Milch"),true);
    assert.equal(useAngebote.getState().addItem("Milch"),false);
    state = useAngebote.getState();
    assert.equal(state.lists[0].items.length,2);
    const milk = state.lists[0].items.find(item=>item.name==="Milch")!;
    assert.match(milk.id,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    state.removeItem(milk.id);
    assert.equal(useAngebote.getState().lists[0].items.length,1);
    assert.equal(useAngebote.getState().createList("HTTP Liste"),true);
    state = useAngebote.getState();
    assert.notEqual(state.activeListId,state.lists[0].id);
    assert.equal(state.addItem("Joghurt"),true);
    await useAngebote.persist.rehydrate();
    state = useAngebote.getState();
    assert.equal(state.lists.find(list=>list.id===state.activeListId)?.items[0].name,"Joghurt");
    assert.equal(new Set(state.lists.map(list=>list.id)).size,2);
  } finally {
    if(oldWindow) Object.defineProperty(globalThis,"window",oldWindow);
    else Reflect.deleteProperty(globalThis,"window");
    if(oldCrypto) Object.defineProperty(globalThis,"crypto",oldCrypto);
    else Reflect.deleteProperty(globalThis,"crypto");
    if(oldStorage) Object.defineProperty(globalThis,"localStorage",oldStorage);
    else Reflect.deleteProperty(globalThis,"localStorage");
  }
});

test("secure-context ID generation keeps native randomUUID", () => {
  let nativeCalls = 0;
  assert.equal(clientId({randomUUID:()=>{nativeCalls++;return "12345678-1234-4123-8123-123456789abc";},getRandomValues:()=>{throw new Error("fallback must not run");}}),"12345678-1234-4123-8123-123456789abc");
  assert.equal(nativeCalls,1);
});
