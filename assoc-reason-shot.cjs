const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1200 });
  await page.goto('http://localhost:3000/home/df-demo', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3500);

  // Right-click the anchor red cell marker to open context menu, then "Show Associated Cells"
  const anchor = await page.evaluate(() => {
    const m = document.querySelector('.cell-risk-warning:not(.cell-risk-warning--associated)');
    const cell = m.closest('.cell-value-cell') || m;
    const r = cell.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(anchor.x, anchor.y, { button: 'right' });
  await sleep(600);
  // click "Show Associated Cells"
  const clicked = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('*')).filter(e => /Show Associated Cells/i.test(e.textContent || '') && e.childElementCount <= 2);
    const target = items[items.length - 1];
    if (target) { target.click(); return true; }
    return false;
  });
  console.log('showAssociated clicked:', clicked);
  await sleep(1200);

  // hover an associated marker
  const assoc = await page.evaluate(() => {
    // pick an associated marker in the upper half so the popover isn't clipped
    const ms = Array.from(document.querySelectorAll('.cell-risk-warning--associated'));
    const m = ms.find(el => el.getBoundingClientRect().y < 700) || ms[0];
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('assoc marker:', JSON.stringify(assoc));
  if (assoc) {
    await page.mouse.move(assoc.x, assoc.y);
    await sleep(700);
  }
  const tipText = await page.evaluate(() => {
    const t = document.querySelector('.cell-associated-risk-tooltip');
    return t ? t.innerText : '(no tooltip)';
  });
  console.log('TOOLTIP:\n' + tipText);
  await page.screenshot({ path: 'assoc-reason-shot.png' });
  await browser.close();
})();
