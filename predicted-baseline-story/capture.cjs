/* Capture real screenshots of the Acme grid telling the Predicted Baseline story. */
const puppeteer = require('puppeteer');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
const URL = 'http://localhost:3000/home/manufacturing-acme';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Expand the first (or Nth) visible row whose name contains `nameSub`, if not already expanded. */
async function expand(page, nameSub, occurrence = 0) {
  const res = await page.evaluate(
    (nameSub, occurrence) => {
      const names = Array.from(document.querySelectorAll('.cell-name'));
      const matches = names.filter((n) => (n.textContent || '').includes(nameSub));
      const target = matches[occurrence];
      if (!target) return { ok: false, reason: 'no-match', count: matches.length };
      const content = target.closest('.cell-content, .divided-cell-content');
      const chev = content && content.querySelector('.chevron-icon');
      if (!chev) return { ok: false, reason: 'no-chevron' };
      if (chev.classList.contains('expanded')) return { ok: true, already: true };
      chev.click();
      return { ok: true, clicked: true };
    },
    nameSub,
    occurrence,
  );
  await sleep(500);
  console.log('expand', JSON.stringify(nameSub), '→', JSON.stringify(res));
  return res;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1680, height: 1000, deviceScaleFactor: 2 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.cell-name')).some((n) => /Predicted Baseline/.test(n.textContent || '')),
    { timeout: 30000 },
  );
  await sleep(1200);

  // 1) Hero: full grid with the measure list (incl. ✦ Predicted Baseline Quantity)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, '01-grid-measures.png') });
  console.log('shot: 01-grid-measures');

  // Expand the Predicted Baseline measure down to the plant level.
  await expand(page, 'Predicted Baseline');
  await expand(page, 'Acme Partners'); // acme-global root under the measure
  await expand(page, 'Acme Partners \u2013 North America');
  await expand(page, 'Acme Vehicle Division \u2013 Light Trucks');
  await sleep(400);

  // 2) Plant-level divergence: Midwest Assembly (ramping) vs Southwest Stamping (flat)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, '02-plants-divergence.png') });
  console.log('shot: 02-plants-divergence');

  // Expand Midwest Assembly to reveal program ramp (E-Motor Housing steepest).
  await expand(page, 'Midwest Assembly');
  await sleep(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, '03-midwest-programs.png') });
  console.log('shot: 03-midwest-programs');

  // 4) Bring the E-Motor Housing ramp (steepest, low-confidence EV program) into view.
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.cell-name')).find((n) =>
      (n.textContent || '').includes('E-Motor Housing'),
    );
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '04-emotor-ramp.png') });
  console.log('shot: 04-emotor-ramp');

  // Scrape monthly Predicted Baseline totals for Midwest Assembly vs Southwest Stamping (for the chart).
  const scrape = await page.evaluate(() => {
    const monthCols = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function rowValues(nameSub) {
      const name = Array.from(document.querySelectorAll('.cell-name')).find((n) =>
        (n.textContent || '').includes(nameSub),
      );
      if (!name) return null;
      const rowEl = name.closest('[class*="grid-row"], .grid-data-row, tr, [role="row"]') || name.closest('div');
      if (!rowEl) return null;
      const cells = Array.from(rowEl.querySelectorAll('.cell-value, .cell-input'));
      const nums = cells
        .map((c) => {
          const t = (c.value != null && c.value !== '' ? c.value : c.textContent) || '';
          const n = parseFloat(t.replace(/[^0-9.\-]/g, ''));
          return isNaN(n) ? null : n;
        })
        .filter((n) => n != null);
      return nums;
    }
    return {
      months: monthCols,
      midwest: rowValues('Midwest Assembly'),
      southwest: rowValues('Southwest Stamping'),
      emotor: rowValues('E-Motor Housing'),
      powertrain: rowValues('Powertrain'),
    };
  });
  console.log('scrape:', JSON.stringify(scrape));
  require('fs').writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(scrape, null, 2));

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
