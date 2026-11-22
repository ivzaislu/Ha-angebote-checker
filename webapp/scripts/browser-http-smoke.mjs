import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// A non-loopback hostname is deliberate: localhost would hide HTTP-only failures.
const port = process.env.APP_PORT || '8080';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}),
  args: ['--no-proxy-server', '--host-resolver-rules=MAP angebote-http.test 127.0.0.1'],
});
try {
  const page = await browser.newPage();
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  const productPhotos='https://cdn.marktguru.de/api/v1/offers/**/images/default/0/medium.webp';
  await page.route(productPhotos,route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="white"/><text x="8" y="60">Milch</text></svg>'}));
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:',error.message); });
  await page.goto(`http://angebote-http.test:${port}/`,{waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(() => isSecureContext), false);
  assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
  await page.locator('[data-testid="angebote-app"][data-ready="true"]').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'de');
  assert.doesNotMatch(await page.locator('body').innerText(), /[А-Яа-яЁё]/);
  await page.getByRole('button', {name:'Einkauf 0', exact:true}).waitFor();
  await page.getByText('Geschäfte',{exact:true}).click();
  await page.getByRole('button',{name:'Norma',exact:true}).waitFor();
  await page.getByRole('button',{name:'NKD',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('angebote-v1')).state.retailers),['NKD']);
  await page.reload();
  await page.locator('[data-testid="angebote-app"][data-ready="true"]').waitFor();
  await page.getByText('Geschäfte',{exact:true}).click();
  await page.getByRole('button',{name:'NKD',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('angebote-v1')).state.retailers),[]);
  await page.getByText('Geschäfte',{exact:true}).click();
  await page.locator('#item').fill('FrontendProbe');
  await page.getByRole('button', {name:'Hinzufügen', exact:true}).click();
  await page.getByRole('button', {name:'Entfernen FrontendProbe', exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button', {name:'Entfernen FrontendProbe', exact:true}).waitFor();
  await page.getByRole('button', {name:'Neue Liste', exact:true}).click();
  await page.getByPlaceholder('Zum Beispiel: Woche').fill('HTTP Testliste');
  await page.getByRole('button', {name:'Erstellen', exact:true}).click();
  await page.getByRole('button', {name:'HTTP Testliste 0', exact:true}).waitFor();
  await page.locator('#item').fill('RemoveProbe');
  await page.getByRole('button', {name:'Hinzufügen', exact:true}).click();
  await page.getByRole('button', {name:'Entfernen RemoveProbe', exact:true}).click();
  await page.getByRole('button', {name:'Entfernen RemoveProbe', exact:true}).waitFor({state:'detached'});
  // No saved scan fixture: search must use the real regional archive. CI forbids
  // all live Marktguru requests inside the app container.
  await page.locator('#item').fill('Milch');
  await page.getByRole('button', {name:'Hinzufügen', exact:true}).click();
  await page.locator('#zip').fill('10115');
  await page.getByRole('button',{name:'Angebote finden',exact:true}).click();
  await page.getByText('aus gespeicherten Angeboten',{exact:true}).waitFor();
  await page.getByText('1,79 €',{exact:true}).waitFor();
  await page.getByTestId('search-mode').filter({hasText:'Suche mit Regeln'}).waitFor();
  assert.equal(await page.getByText('vom neuronalen Netz geprüft',{exact:true}).count(),0);
  // A legacy scan must be rechecked, not displayed as new rules results.
  await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem('angebote-v1'));
    delete saved.state.scans[saved.state.activeListId].rulesVersion;
    localStorage.setItem('angebote-v1',JSON.stringify(saved));
  });
  await page.reload();
  await page.getByTestId('scan-mode-changed').waitFor();
  assert.equal(await page.getByText('1,79 €',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Angebote finden',exact:true}).click();
  await page.getByText('1,79 €',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('aus gespeicherten Angeboten',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Preisverlauf',exact:true}).click();
  await page.getByText('Von 1,29 bis 1,79 € · Beobachtungen: 2',{exact:true}).waitFor();
  // No model controls, owner token fields or review/training screens remain.
  assert.equal(await page.locator('#training-key').count(),0);
  assert.equal(await page.getByTestId('review-card').count(),0);
  assert.doesNotMatch(await page.locator('body').innerText(), /neuron|trainier|Inhaberschlüssel/i);
  // Offer photos remain useful independently of the removed review UI.
  const image=page.locator('img[src*="compose-smoke-milk"]').first();
  await image.evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw new Error('Offer photo missing');});
  for(const name of ['Apfel','Apfelsaft','Pizza','Kaffee']){
    await page.locator('#item').fill(name);
    await page.getByRole('button',{name:'Hinzufügen',exact:true}).click();
  }
  await page.getByRole('button',{name:'Angebote finden',exact:true}).click();
  for(const name of ['Knackige Tafeläpfel','Bio Apfel-Direktsaft naturtrüb','Apfelschorle','Steinofenpizza Margherita','Barista Selection']){
    await page.locator('article').filter({hasText:name}).waitFor();
  }
  for(const name of ['Apfelstrudel','Apfelnektar','Pizzateig','Kaffeetassen']){
    assert.equal(await page.locator('article').filter({hasText:name}).count(),0,`False match displayed: ${name}`);
  }
  await page.reload();
  await page.locator('article').filter({hasText:'Knackige Tafeläpfel'}).waitFor();
  await page.close();
  const other = await browser.newPage();
  other.on('pageerror', error => errors.push(error.message));
  const missing = await other.goto(`http://angebote-http.test:${port}/missing-page`);
  assert.equal(missing.status(),404);
  await other.getByRole('heading',{name:'Seite nicht gefunden',exact:true}).waitFor();
  await other.getByRole('link',{name:'Zur Startseite',exact:true}).waitFor();
  await other.goto(`http://angebote-http.test:${port}/?install=1&platform=ios`);
  assert.equal(await other.locator('html').getAttribute('lang'),'de');
  await other.getByRole('heading',{name:'Öffnen Sie diesen Link auf Ihrem iPhone oder iPad',exact:true}).waitFor();
  await other.close();
  assert.deepEqual(errors,[]);
  console.log('HTTP browser checks passed: lists, NKD filter, archive-first rules search, scan persistence, price history, offer photos, no model controls, German 404 and install pages');
} finally {
  await browser.close();
}
