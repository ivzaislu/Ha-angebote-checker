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
  await page.getByText('aktiv · v2',{exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'de');
  assert.doesNotMatch(await page.locator('body').innerText(), /[А-Яа-яЁё]/);
  await page.getByRole('button', {name:'Einkauf 0', exact:true}).waitFor();
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
  await page.getByText('vom neuronalen Netz geprüft',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('aus gespeicherten Angeboten',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Preisverlauf',exact:true}).click();
  await page.getByText('Von 1,29 bis 1,79 € · Beobachtungen: 2',{exact:true}).waitFor();
  // Training must be authenticated and keep working after the page is closed.
  await page.getByText('Neuronales Produktnetz',{exact:true}).click();
  const loadReview = page.getByRole('button',{name:'Beispiele zur Prüfung laden',exact:true});
  await page.locator('#training-key').fill('wrong-key');
  await loadReview.click();
  await page.getByRole('alert').waitFor();
  await page.getByTestId('review-card').waitFor({state:'detached'});
  await page.locator('#training-key').fill(process.env.TRAINING_ADMIN_TOKEN || '');
  await loadReview.click();
  await page.getByTestId('review-card').waitFor();
  await page.getByText('Produkt: Alpen Bio Frische Milch',{exact:true}).waitFor();
  await page.getByText('Weiterer Name in der Quelle: Frische Milch',{exact:true}).waitFor();
  await page.getByTestId('review-image').scrollIntoViewIfNeeded();
  await page.getByTestId('review-image').evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw new Error('Review photo did not load');});
  assert.match(await page.getByTestId('review-image').getAttribute('src'),/^https:\/\/cdn\.marktguru\.de\/api\/v1\/offers\/compose-smoke-milk\//);
  // An expired/blocked CDN image must leave the card usable with an explicit fallback.
  await page.unroute(productPhotos);
  await page.route(productPhotos,route=>route.abort());
  await page.reload();
  await page.getByText('Neuronales Produktnetz',{exact:true}).click();
  await page.locator('#training-key').fill(process.env.TRAINING_ADMIN_TOKEN || '');
  await page.getByRole('button',{name:'Beispiele zur Prüfung laden',exact:true}).click();
  await page.getByTestId('review-card').scrollIntoViewIfNeeded();
  await page.getByTestId('review-image-unavailable').waitFor();
  const initialQuery=await page.getByTestId('review-card').locator('p').first().innerText();
  await page.getByRole('button',{name:'Überspringen',exact:true}).click();
  await page.getByText('Geprüfte Beispiele in der Datenbank: 0.',{exact:true}).waitFor();
  await loadReview.click(); // Skipped examples remain unreviewed and can reappear.
  await page.getByText(initialQuery,{exact:true}).waitFor();
  const reviewCard=page.getByTestId('review-card');
  const intent=(await reviewCard.locator('p').first().innerText()).replace('Suchanfrage: ','').trim();
  const correct = intent === 'Milch'; // Isolated fixture is Frische Milch, Bio 1 l.
  await page.locator('#training-key').fill('wrong-key');
  await reviewCard.getByRole('button',{name:correct ? 'Passt' : 'Passt nicht',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.getByText('Geprüfte Beispiele in der Datenbank: 0.',{exact:true}).waitFor();
  await page.locator('#training-key').fill(process.env.TRAINING_ADMIN_TOKEN || '');
  await reviewCard.getByRole('button',{name:correct ? 'Passt' : 'Passt nicht',exact:true}).click();
  await page.getByText('Geprüfte Beispiele in der Datenbank: 1.',{exact:true}).waitFor();
  const savedText = positive => `Gespeichert: «Frische Milch» für «${intent}» — ${positive ? 'passt' : 'passt nicht'}.`;
  await page.getByRole('button',{name:'Letzte Antwort ändern',exact:true}).click();
  await page.getByText(savedText(!correct),{exact:true}).waitFor();
  await page.getByRole('button',{name:'Letzte Antwort ändern',exact:true}).click();
  await page.getByText(savedText(correct),{exact:true}).waitFor();
  const secondIntent=(await reviewCard.locator('p').first().innerText()).replace('Suchanfrage: ','').trim();
  assert.notEqual(intent,secondIntent);
  await reviewCard.getByRole('button',{name:secondIntent==='Milch' ? 'Passt' : 'Passt nicht',exact:true}).click();
  await page.getByText('Geprüfte Beispiele in der Datenbank: 2.',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('Neuronales Produktnetz',{exact:true}).click();
  await page.getByText('Geprüfte Beispiele in der Datenbank: 2.',{exact:true}).waitFor();
  await page.locator('#training-key').fill(process.env.TRAINING_ADMIN_TOKEN || '');
  await page.getByRole('button',{name:'Beispiele zur Prüfung laden',exact:true}).click();
  await page.getByTestId('review-card').waitFor({state:'detached'});
  await page.getByText(/Auswahl abgeschlossen/).waitFor();
  await page.locator('#training-key').fill('wrong-key');
  await page.getByRole('button',{name:'Neuronales Netz trainieren',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.locator('#training-key').fill(process.env.TRAINING_ADMIN_TOKEN || '');
  await page.getByRole('button',{name:'Neuronales Netz trainieren',exact:true}).click();
  await page.getByRole('button',{name:'Training läuft…',exact:true}).waitFor();
  await page.close();
  // A new page sees the durable task after the initiating page has been closed.
  const other = await browser.newPage();
  other.on('pageerror', error => errors.push(error.message));
  await other.goto(`http://angebote-http.test:${port}/`,{waitUntil:'domcontentloaded'});
  await other.getByText('Neuronales Produktnetz',{exact:true}).click();
  await other.getByTestId('training-status').getByText(/Trainingsdaten werden vorbereitet|Neuronales Netz wird trainiert|Modell wird geprüft und gespeichert|Training wartet|Training abgeschlossen/).first().waitFor();
  const terminal = /Training abgeschlossen\. (Modell aktiviert|Qualitätsprüfung nicht bestanden)/;
  await other.getByTestId('training-status').getByText(terminal).waitFor({timeout:180_000});
  if((await other.getByTestId('training-status').innerText()).includes('Modell aktiviert.')) {
    const candidate=(await other.getByTestId('training-status').innerText()).match(/product-v2-[a-f0-9]+/)[0];
    await other.getByTestId('active-text-model').filter({hasText:candidate}).waitFor();
  }
  await other.reload();
  await other.getByText('Neuronales Produktnetz',{exact:true}).click();
  await other.getByTestId('training-status').getByText(terminal).waitFor();
  await other.getByText('Geprüfte Beispiele in der Datenbank: 2.',{exact:true}).waitFor();
  assert.equal(await other.locator('#training-key').inputValue(),'');
  assert.equal(await other.getByRole('button',{name:'Neuronales Netz trainieren',exact:true}).isDisabled(),true);
  assert.doesNotMatch(await other.locator('body').innerText(), /[А-Яа-яЁё]/);
  const missing = await other.goto(`http://angebote-http.test:${port}/missing-page`);
  assert.equal(missing.status(),404);
  await other.getByRole('heading',{name:'Seite nicht gefunden',exact:true}).waitFor();
  await other.getByRole('link',{name:'Zur Startseite',exact:true}).waitFor();
  await other.goto(`http://angebote-http.test:${port}/?install=1&platform=ios`);
  assert.equal(await other.locator('html').getAttribute('lang'),'de');
  await other.getByRole('heading',{name:'Öffnen Sie diesen Link auf Ihrem iPhone oder iPad',exact:true}).waitFor();
  await other.close();
  assert.deepEqual(errors,[]);
  console.log('HTTP browser checks passed: lists, cache search, history, fuller source names and decoded photos with failure fallback, authenticated review/correction/persistence, training and cross-page result');
} finally {
  await browser.close();
}
