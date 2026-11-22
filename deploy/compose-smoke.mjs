// Run only in CI's isolated test database, via node --input-type=module on stdin.
import assert from 'node:assert/strict';
import pg from 'pg';
import { archiveOffers, priceHistory } from './src/lib/offer-archive.ts';

assert.equal(process.env.COMPOSE_SMOKE_TEST, '1', 'Refusing to insert fixtures outside the explicit smoke-test environment');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sql = { query: async (text, params) => (await pool.query(text, params)).rows };
const offer = { id: 'compose-smoke-milk', name: 'Alpen Bio Frische Milch', product:{name:'Frische Milch'}, description: 'Bio 1 l', retailerName: 'Compose fixture', price: 1.29 };
try {
  assert.ok((await fetch('http://127.0.0.1:8080/')).ok, 'HTTP page must respond');
  if (process.env.VERIFY_ONLY !== '1') {
    assert.equal(await archiveOffers(sql, 'de', '10115', [offer, offer]), 1);
    assert.equal(await archiveOffers(sql, 'de', '10115', [{ ...offer, price: 1.79 }]), 1);
  }
  const history = await priceHistory(sql, 'de', offer.product.name, '10115');
  assert.equal(history.observations, 2);
  assert.equal(Number(history.minimum), 1.29);
  assert.equal(Number(history.maximum), 1.79);
  assert.equal(await archiveOffers(sql, 'de', '10115', [offer]), 0);
  // Compatibility regression in this disposable CI database only: runtime
  // archive/search must work even when all retired model tables are absent.
  for (const table of ['product_training_jobs','product_model_events','product_model_active','product_review_labels','product_models','offer_brain']) {
    await sql.query(`drop table if exists ${table}`);
  }
  console.log(process.env.VERIFY_ONLY === '1' ? 'archive persistence after app restart OK' : 'HTTP and PostgreSQL archive OK without retired model tables');
} finally {
  await pool.end();
}
