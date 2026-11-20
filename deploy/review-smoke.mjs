import assert from 'node:assert/strict';
import pg from 'pg';
assert.equal(process.env.COMPOSE_SMOKE_TEST,'1','Isolated CI database only');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  const labels=(await pool.query('select intent,name,description,positive from product_review_labels order by intent')).rows;
  assert.equal(labels.length,2);
  assert.equal(labels.find(row=>row.intent==='Milch')?.positive,true);
  assert.equal(labels.find(row=>row.intent==='Reis')?.positive,false);
  assert.ok(labels.every(row=>row.name==='Frische Milch' && row.description==='Bio 1 l'));
  const [candidate]=(await pool.query('select id,report from product_models order by created_at desc,id desc limit 1')).rows;
  assert.equal(candidate.report.sources.human,2,'Next training must consume the persisted UI labels');
  assert.equal(candidate.report.featureVersion,3,'New candidates use explicit category-aware features');
  const [weights]=(await pool.query('select model from product_models where id=$1',[candidate.id])).rows;
  assert.equal(weights.model.featureVersion,3);
  const [active]=(await pool.query('select model_id from product_model_active where singleton=1')).rows;
  assert.ok(active,'Review/rejected training must preserve an active model');
  if(!candidate.report.eligible) assert.notEqual(active.model_id,candidate.id);
  console.log('UI human labels persisted with correct polarity; next trained candidate used both labels; activation policy respected');
} finally {await pool.end();}
