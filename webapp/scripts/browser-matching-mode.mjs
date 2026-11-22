import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP angebote-http.test 127.0.0.1']});
try {
  const page=await browser.newPage();
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  await page.route('https://cdn.marktguru.de/**',r=>r.abort());
  await page.goto(`http://angebote-http.test:${process.env.APP_PORT||8080}/`,{waitUntil:'domcontentloaded'});
  await page.getByTestId('search-mode').filter({hasText:'Experimentelle neuronale Suche'}).waitFor();
  await page.getByText('aktiv · v2',{exact:true}).waitFor();
  await page.locator('#item').fill('Milch');
  await page.getByRole('button',{name:'Hinzufügen',exact:true}).click();
  await page.locator('#zip').fill('10115');
  await page.getByRole('button',{name:'Angebote finden',exact:true}).click();
  await page.getByText('1,79 €',{exact:true}).waitFor();
  await page.getByText('vom neuronalen Netz geprüft',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>{
    const s=JSON.parse(localStorage.getItem('angebote-v1')).state;
    return s.scans[s.activeListId].matchingMode;
  }),'neural');
  console.log('Explicit neural opt-in uses stored model; default rules path verified separately');
} finally {await browser.close();}
