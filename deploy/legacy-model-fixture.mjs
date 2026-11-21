// CI-only fixture: retain immutable weights but recreate an old rejected report.
import assert from 'node:assert/strict';
import pg from 'pg';
import {activeProductModelId,readProductCandidate,saveProductCandidate} from './src/lib/product-model-store.ts';
assert.equal(process.env.COMPOSE_SMOKE_TEST,'1');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const sql={query:async(text,params)=>(await pool.query(text,params)).rows};
try {
  const active=await readProductCandidate(sql,await activeProductModelId(sql));
  assert.ok(active);
  if(process.env.LEGACY_MODEL_ID){
    const legacy=await readProductCandidate(sql,process.env.LEGACY_MODEL_ID);
    assert.ok(legacy);
    assert.deepEqual(active.net,legacy.net);
    assert.notEqual(active.id,legacy.id);
    assert.equal(legacy.report.eligible,false);
    assert.equal(active.report.deployment.version,2);
    console.log('legacy candidate preserved; rechecked weights unchanged');
  } else {
    const legacy={...active.report,schemaVersion:1,deployment:undefined,eligible:false,reasons:['legacy release evaluation']};
    const saved=await saveProductCandidate(sql,active.net,legacy);
    console.log(saved.id);
  }
} finally {await pool.end();}
