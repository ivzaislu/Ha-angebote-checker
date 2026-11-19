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
  // Saved search response is a fixture; the history request itself uses the real server/DB.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('angebote-v1'));
    const state = saved.state;
    const active = state.lists.find(list => list.id === state.activeListId);
    active.items = [{id:'history-fixture',name:'Milch'}];
    state.scans[active.id] = {at:new Date().toISOString(),errors:{},byItem:{Milch:[{
      id:'history-offer',item:'Milch',productName:'Frische Milch',description:'Bio 1 l',
      retailer:'Compose fixture',priceLabel:'1,29 €',priceValue:1.29,
      validFrom:'',validTo:'',imageUrl:'',relevance:100,onlineOnly:false,category:'Milch',
    }]}};
    localStorage.setItem('angebote-v1',JSON.stringify(saved));
  });
  await page.reload();
  await page.getByRole('button',{name:'История цен',exact:true}).click();
  await page.getByText('От 1.29 до 1.79 € · наблюдений: 2',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('HTTP browser checks passed: add/remove, new list, reload persistence, offer cards and real archived price history');
} finally {
  await browser.close();
}
