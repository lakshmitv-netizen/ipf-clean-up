const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1200 });
  await page.goto('http://localhost:3000/home/df-demo', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3500);

  async function anchorXY() {
    return await page.evaluate(() => {
      const m = document.querySelector('.cell-risk-warning:not(.cell-risk-warning--associated)');
      if (!m) return null;
      const cell = m.closest('.cell-value-cell') || m.parentElement;
      const r = cell.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  }
  async function rightClickAnchorAndReadMenu() {
    const a = await anchorXY();
    await page.mouse.click(a.x, a.y, { button: 'right' });
    await sleep(500);
    return await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('.cell-context-menu-item')).find(b => /Associated Cells/.test(b.textContent));
      return item ? item.textContent.replace(/\s+/g, ' ').trim() : null;
    });
  }
  async function clickAssocMenuItem() {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.cell-context-menu-item')).find(b => /Associated Cells/.test(b.textContent));
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); btn.click();
    });
    await sleep(1200);
  }
  const countAssoc = () => page.evaluate(() => document.querySelectorAll('.cell-risk-warning--associated').length);

  // initial: menu says Show, no associated icons
  const label1 = await rightClickAnchorAndReadMenu();
  console.log('label before:', label1, '| assoc icons:', await countAssoc());
  await clickAssocMenuItem();
  console.log('after SHOW -> assoc icons:', await countAssoc());

  // now menu should say Hide
  const label2 = await rightClickAnchorAndReadMenu();
  console.log('label while shown:', label2);
  await clickAssocMenuItem();
  console.log('after HIDE -> assoc icons:', await countAssoc());

  // menu should say Show again
  const label3 = await rightClickAnchorAndReadMenu();
  console.log('label after hide:', label3);
  await browser.close();
})();
