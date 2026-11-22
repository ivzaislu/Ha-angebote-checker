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
  const ruleOffers = [
    ['apples-hit','Knackige Tafeläpfel','Obst','Frische Äpfel',2.19],
    ['apples-miss','Apfelstrudel','Backwaren','600 g',0.01],
    ['juice-hit','Bio Apfel-Direktsaft naturtrüb','Fruchtsaft','1 l',2.29],
    ['schorle-hit','Apfelschorle','Softdrinks','1,5 l',1.89],
    ['juice-miss','Apfelnektar','Fruchtsaft','50 % Frucht',0.02],
    ['pizza-hit','Steinofenpizza Margherita','Tiefkühlgerichte','Knuspriger Teig, mit Tomatensauce',2.39],
    ['pizza-miss','Pizzateig','Tiefkühlpizza','400 g',0.03],
    ['coffee-hit','Barista Selection','Getränke > Kaffee','1 kg',7.49],
    ['coffee-miss','Kaffeetassen','Kaffee','6 Stück',0.04],
  ].map(([id,name,category,description,price])=>({id:`rule-${id}`,name,description,price,categories:[{name:category}],retailerName:'Rules fixture'}));
  await archiveOffers(sql,'de','10115',ruleOffers);
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
