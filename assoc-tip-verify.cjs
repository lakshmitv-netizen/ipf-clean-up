const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1200 });
  await page.goto('http://localhost:3000/home/df-demo', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3500);

  // 1) Find a filled agreement warning marker (anchor red cell)
  const anchor = await page.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('.cell-risk-warning:not(.cell-risk-warning--associated)'));
    if (!marks.length) return null;
    const m = marks[0];
    const cell = m.closest('.cell-value-cell') || m.closest('td') || m.parentElement;
    const r = (cell || m).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, count: marks.length };
  });
  console.log('anchor:', JSON.stringify(anchor));
  if (!anchor) { console.log('NO ANCHOR'); await browser.close(); return; }

  // 2) Right-click the anchor cell to open context menu
  await page.mouse.click(anchor.x, anchor.y, { button: 'right' });
  await sleep(700);
  const menuItems = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cell-context-menu-item .cell-context-menu-label')).map(e => e.textContent.trim()));
  console.log('menu items:', JSON.stringify(menuItems));

  // 3) Click "Show Associated Cells"
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.cell-context-menu-item'))
      .find(b => /Show Associated Cells/.test(b.textContent));
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.click();
    return true;
  });
  console.log('clicked show-associated:', clicked);
  await sleep(1500);

  // 4) Find an outline associated icon
  const assoc = await page.evaluate(() => {
    const marks = Array.from(document.querySelectorAll('.cell-risk-warning--associated'));
    if (!marks.length) return null;
    const m = marks[0];
    const r = m.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, count: marks.length };
  });
  console.log('assoc:', JSON.stringify(assoc));
  if (!assoc) { console.log('NO ASSOCIATED ICONS'); await browser.close(); return; }

  // 5) Click the outline icon
  await page.mouse.click(assoc.x, assoc.y);
  await sleep(600);
  const tip = await page.evaluate(() => {
    const el = document.querySelector('.cell-associated-risk-tooltip');
    if (!el) return null;
    const title = el.querySelector('.cell-risk-tooltip-title')?.textContent.trim();
    const body = el.querySelector('.cell-risk-tooltip-body')?.textContent.trim();
    const r = el.getBoundingClientRect();
    return { title, body, w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 };
  });
  console.log('TOOLTIP:', JSON.stringify(tip, null, 2));

  await page.screenshot({ path: 'assoc-tip-shot.png' });
  await browser.close();
})();
