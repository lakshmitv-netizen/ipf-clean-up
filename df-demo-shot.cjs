const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1200 });
  await page.goto('http://localhost:5173/home/df-demo', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3000);
  async function expand(text) {
    return await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('*'));
      const label = els.find(e => e.childElementCount === 0 && e.textContent.trim() === t);
      if (!label) return false;
      let row = label; for (let i=0;i<8 && row.parentElement;i++){ row=row.parentElement; if (row.classList&&row.classList.contains('grid-row')) break; }
      const btn = row.querySelector('button.chevron-icon'); if(!btn) return false; btn.click(); return true;
    }, text);
  }
  // read a row's month cells by label
  async function readRow(text) {
    return await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('*'));
      const label = els.find(e => e.childElementCount === 0 && e.textContent.trim() === t);
      if (!label) return null;
      let row = label; for (let i=0;i<8 && row.parentElement;i++){ row=row.parentElement; if (row.classList&&row.classList.contains('grid-row')) break; }
      const cells = Array.from(row.querySelectorAll('*')).map(e=>e.textContent.trim()).filter(x=>/^[\d,]+$/.test(x));
      return cells;
    }, text);
  }
  await expand('Sales Agreement Quantity (No.s)');
  await sleep(1200);
  const saGeo = await readRow('MagnaDrive - Georgia Plant');
  await expand('Order Quantity (No.s)');
  await sleep(1200);
  // there are now two "Georgia Plant" rows; grab all
  const allGeo = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.grid-row')).filter(r=>/MagnaDrive - Georgia Plant/.test(r.textContent));
    return rows.map(r => Array.from(r.querySelectorAll('*')).map(e=>e.textContent.trim()).filter(x=>/^[\d,]+$/.test(x)).slice(0,13));
  });
  console.log(JSON.stringify({saGeo, allGeo}));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
