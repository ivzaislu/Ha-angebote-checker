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
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:',error.message); });
  await page.goto(`http://angebote-http.test:${port}/`,{waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(() => isSecureContext), false);
  assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
  await page.getByText('активна · v2',{exact:true}).waitFor();
  await page.locator('#item').fill('FrontendProbe');
  await page.getByRole('button', {name:'Добавить', exact:true}).click();
  await page.getByRole('button', {name:'Убрать FrontendProbe', exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button', {name:'Убрать FrontendProbe', exact:true}).waitFor();
  await page.getByRole('button', {name:'Новый список', exact:true}).click();
  await page.getByPlaceholder('Например, Неделя').fill('HTTP Testliste');
  await page.getByRole('button', {name:'Создать', exact:true}).click();
  await page.getByRole('button', {name:'HTTP Testliste 0', exact:true}).waitFor();
  await page.locator('#item').fill('RemoveProbe');
  await page.getByRole('button', {name:'Добавить', exact:true}).click();
  await page.getByRole('button', {name:'Убрать RemoveProbe', exact:true}).click();
  await page.getByRole('button', {name:'Убрать RemoveProbe', exact:true}).waitFor({state:'detached'});
  // No saved scan fixture: search must use the real regional archive. CI forbids
  // all live Marktguru requests inside the app container.
  await page.locator('#item').fill('Milch');
  await page.getByRole('button', {name:'Добавить', exact:true}).click();
  await page.locator('#zip').fill('10115');
  await page.getByRole('button',{name:'Найти акции',exact:true}).click();
  await page.getByText('из сохранённых акций',{exact:true}).waitFor();
  await page.getByText('1,79 €',{exact:true}).waitFor();
  await page.getByText('проверено нейросетью',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('из сохранённых акций',{exact:true}).waitFor();
  await page.getByRole('button',{name:'История цен',exact:true}).click();
  await page.getByText('От 1.29 до 1.79 € · наблюдений: 2',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('HTTP browser checks passed: add/remove, new list, reload persistence, active trained v2 model, cache-first search with live Marktguru blocked and real price history');
} finally {
  await browser.close();
}
