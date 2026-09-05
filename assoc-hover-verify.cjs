const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1200 });
  await page.goto('http://localhost:3000/home/df-demo', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3500);

  const anchor = await page.evaluate(() => {
    const m = document.querySelector('.cell-risk-warning:not(.cell-risk-warning--associated)');
    if (!m) return null;
    const cell = m.closest('.cell-value-cell') || m.parentElement;
    const r = cell.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(anchor.x, anchor.y, { button: 'right' });
  await sleep(600);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.cell-context-menu-item')).find(b => /Show Associated Cells/.test(b.textContent));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); btn.click();
  });
  await sleep(1400);

  const assoc = await page.evaluate(() => {
    const m = document.querySelector('.cell-risk-warning--associated');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  // HOVER only (no click)
  await page.mouse.move(assoc.x, assoc.y);
  await sleep(500);
  const tip = await page.evaluate(() => {
    const el = document.querySelector('.cell-associated-risk-tooltip');
    if (!el) return null;
    return { title: el.querySelector('.cell-risk-tooltip-title')?.textContent.trim(), body: el.querySelector('.cell-risk-tooltip-body')?.textContent.trim() };
  });
  console.log('HOVER TOOLTIP:', JSON.stringify(tip));

  // move away -> should close
  await page.mouse.move(assoc.x + 400, assoc.y);
  await sleep(400);
  const after = await page.evaluate(() => !!document.querySelector('.cell-associated-risk-tooltip'));
  console.log('still open after move away:', after);
  await browser.close();
})();
