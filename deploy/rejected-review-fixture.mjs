import assert from 'node:assert/strict';
import pg from 'pg';
import {archiveOffers} from './src/lib/offer-archive.ts';
import {activeProductModelId,readProductCandidate,saveProductCandidate} from './src/lib/product-model-store.ts';
assert.equal(process.env.COMPOSE_SMOKE_TEST,'1','Isolated CI database only');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const sql={query:async(text,params)=>(await pool.query(text,params)).rows};
try {
  if(process.env.VERIFY_ONLY==='1') {
    const [fixture]=await sql.query("select id,report from product_models where report->>'fixtureName'='rejected-review' order by created_at desc limit 1");
    assert.ok(fixture);
    assert.equal(await activeProductModelId(sql),fixture.report.fixtureActiveId,'Review cannot activate failed weights');
    assert.equal(fixture.report.eligible,false);
    const [label]=await sql.query("select positive from product_review_labels where intent='Apfel' and name='Tafeläpfel XXL' and description='5 kg'");
    assert.equal(label?.positive,true);
    const events=await sql.query('select id from product_model_events where model_id=$1',[fixture.id]);
    assert.equal(events.length,0);
    console.log('Rejected candidate stayed inactive; its explicit UI correction persisted as a human label');
  } else {
    const activeId=await activeProductModelId(sql);
    const active=await readProductCandidate(sql,activeId);
    assert.ok(active);
    const example={intent:'Apfel',name:'Tafeläpfel XXL',category:'Äpfel',description:'5 kg',positive:true,source:'rules'};
    await archiveOffers(sql,'de','10115',[{id:'compose-smoke-apples',name:example.name,description:example.description,categories:[{name:example.category}],price:5}]);
    const net=structuredClone(active.net);net.w2.fill(0);net.b2=-20;
    const report={...active.report,eligible:false,reasons:['weak validation: fixture conflict requires explicit review'],
      supportedIntents:['Apfel'],vocabulary:['tafelapfel','apfel'],fixtureName:'rejected-review',fixtureActiveId:activeId,
      deployment:{...active.report.deployment,weakConflicts:[{...example,modelDecision:false,modelScore:0.01}]}};
    const candidate=await saveProductCandidate(sql,net,report);
    assert.equal(await activeProductModelId(sql),activeId);
    console.log(JSON.stringify({active:activeId,rejected:candidate.id}));
  }
}finally{await pool.end();}
