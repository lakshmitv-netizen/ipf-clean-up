/* Reproduce the Charts-panel compare view (Midwest vs Southwest) to verify the divergence reads. */
const puppeteer = require('puppeteer');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
const URL = 'http://localhost:3000/home/manufacturing-acme';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function expand(page, nameSub, occurrence = 0) {
  const res = await page.evaluate((nameSub, occurrence) => {
    const names = Array.from(document.querySelectorAll('.cell-name'));
    const matches = names.filter((n) => (n.textContent || '').includes(nameSub));
    const target = matches[occurrence];
    if (!target) return { ok: false };
    const content = target.closest('.cell-content, .divided-cell-content');
    const chev = content && content.querySelector('.chevron-icon');
    if (!chev) return { ok: false };
    if (!chev.classList.contains('expanded')) chev.click();
    return { ok: true };
  }, nameSub, occurrence);
  await sleep(450);
  return res;
}

/** Click options whose name is in `names` and whose enclosing group label contains `groupSub`. */
async function pickInGroup(page, groupSub, names) {
  const res = await page.evaluate((groupSub, names) => {
    const list = document.querySelector('.compare-picker-list');
    if (!list) return { ok: false, reason: 'no-list' };
    let curGroup = '';
    const clicked = [];
    for (const li of Array.from(list.children)) {
      const head = li.querySelector('.compare-picker-group-label');
      if (head) { curGroup = head.textContent || ''; continue; }
      const opt = li.querySelector('.compare-picker-option');
      const nm = opt && opt.querySelector('.compare-picker-option-name');
      const nmt = nm ? (nm.textContent || '').trim() : '';
      if (opt && curGroup.includes(groupSub) && names.includes(nmt) && !opt.classList.contains('is-selected')) {
        opt.click();
        clicked.push(nmt);
        break; // only the first matching node (North America → Light Trucks)
      }
    }
    return { ok: clicked.length > 0, clicked };
  }, groupSub, names);
  await sleep(500);
  console.log('pickInGroup', JSON.stringify(groupSub), '→', JSON.stringify(res));
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
  await sleep(1000);

  await expand(page, 'Predicted Baseline');
  await expand(page, 'Acme Partners');
  await expand(page, 'Acme Partners \u2013 North America');
  await expand(page, 'Acme Vehicle Division \u2013 Light Trucks');

  // Open the Charts panel.
  await page.click('button[title="Chart"]');
  await page.waitForSelector('.compare-picker-input', { timeout: 15000 });
  await sleep(600);

  // Open the compare picker and select the two story plants.
  await page.click('.compare-picker-input');
  await page.waitForSelector('.compare-picker-dropdown', { timeout: 10000 });
  await sleep(400);
  // Select Midwest Assembly first (under the Predicted Baseline measure group).
  await pickInGroup(page, 'Predicted Baseline', ['Midwest Assembly']);
  // Reopen the dropdown if it closed after the first selection, then add Southwest Stamping.
  if (!(await page.$('.compare-picker-dropdown'))) {
    await page.click('.compare-picker-input');
    await page.waitForSelector('.compare-picker-dropdown', { timeout: 10000 });
    await sleep(400);
  }
  await pickInGroup(page, 'Predicted Baseline', ['Southwest Stamping']);

  // Close dropdown by clicking the panel header, then let the compare chart render.
  await page.click('.charts-panel-header');
  await sleep(1000);

  const panel = await page.$('.charts-panel');
  if (panel) {
    await panel.screenshot({ path: path.join(OUT, '05-compare-chart.png') });
    console.log('shot: 05-compare-chart');
  } else {
    console.log('no .charts-panel found');
  }

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
