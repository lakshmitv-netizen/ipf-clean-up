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
    const cell = m.closest('.cell-value-cell');
    const r = cell.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: cell.getAttribute('data-cell-key') };
  });
  console.log('anchor key:', anchor.key);
  await page.mouse.click(anchor.x, anchor.y, { button: 'right' });
  await sleep(500);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.cell-context-menu-item')).find(b => /Associated Cells/.test(b.textContent));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); btn.click();
  });
  await sleep(1300);

  const assoc = await page.evaluate(() => {
    const m = document.querySelector('.cell-risk-warning--associated');
    const r = m.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(assoc.x, assoc.y);
  await sleep(500);
  const cta = await page.evaluate(() => {
    const btn = document.querySelector('.cell-associated-risk-tooltip .cell-risk-tooltip-cta');
    return btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  console.log('CTA label:', cta);

  // click the CTA
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.cell-associated-risk-tooltip .cell-risk-tooltip-cta');
    if (!btn) return false; btn.click(); return true;
  });
  await sleep(500);
  const flashed = await page.evaluate((key) => {
    const el = document.querySelector(`[data-cell-key="${key}"]`);
    return { hasFlashClass: el ? el.classList.contains('cell-flash-highlight') : null, tipClosed: !document.querySelector('.cell-associated-risk-tooltip') };
  }, anchor.key);
  console.log('CTA clicked:', clicked, '| flash on anchor:', flashed.hasFlashClass, '| popover closed:', flashed.tipClosed);
  await browser.close();
})();
