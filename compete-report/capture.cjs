/* Capture real screenshots of our scenario-planning drawer for the compete deck. */
const puppeteer = require('puppeteer');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
const URL = 'http://localhost:3000/home/manufacturing-acme';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1680, height: 1000, deviceScaleFactor: 2 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.scenario-drawer', { timeout: 30000 });
  await sleep(1500);

  const drawer = async () => page.$('.scenario-drawer');

  // 1) Collapsed strip
  let el = await drawer();
  await el.screenshot({ path: path.join(OUT, 'our-01-collapsed.png') });
  console.log('shot: collapsed');

  // Expand to full: click the Expand chevron a few times.
  for (let i = 0; i < 3; i++) {
    const btn = await page.$('button.scenario-icon-btn[title="Expand"]');
    if (btn) { await btn.click(); await sleep(650); }
  }
  await sleep(1200);

  // 2) Full expanded drawer (whole)
  el = await drawer();
  await el.screenshot({ path: path.join(OUT, 'our-02-expanded-full.png') });
  console.log('shot: expanded-full');

  // 3) KPI comparison table region
  const table = await page.$('.scenario-compare-left');
  if (table) { await table.screenshot({ path: path.join(OUT, 'our-03-kpi-table.png') }); console.log('shot: kpi-table'); }

  // 4) Charts region
  const charts = await page.$('.scenario-compare-right');
  if (charts) { await charts.screenshot({ path: path.join(OUT, 'our-04-charts.png') }); console.log('shot: charts'); }

  // 5) Goal-seek: click an editable KPI cell to reveal the input, then screenshot table
  const editable = await page.$('.scenario-cell-val--editable');
  if (editable) {
    await editable.click();
    await sleep(500);
    const t2 = await page.$('.scenario-compare-left');
    if (t2) { await t2.screenshot({ path: path.join(OUT, 'our-05-goalseek.png') }); console.log('shot: goalseek'); }
    await page.keyboard.press('Escape');
  }

  // 6) Full-page context (grid + drawer) for the "our screen in context" hero
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'our-06-context.png'), fullPage: false });
  console.log('shot: context');

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
