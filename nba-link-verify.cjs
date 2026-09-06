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
    const r = m.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  // hover the marker to open the anchor popover
  await page.mouse.move(anchor.x, anchor.y);
  await sleep(500);
  const info = await page.evaluate(() => {
    const link = document.querySelector('.cell-risk-tooltip-nba-link');
    const oldBtn = Array.from(document.querySelectorAll('.cell-agreement-risk-tooltip .cell-risk-tooltip-cta')).find(b => /Show Associated Cells/.test(b.textContent));
    return { linkText: link ? link.textContent.replace(/\s+/g,' ').trim() : null, hasSparkleSvg: !!(link && link.querySelector('svg')), oldButtonStillThere: !!oldBtn };
  });
  console.log('anchor popover CTA:', JSON.stringify(info));

  await page.screenshot({ path: 'nba-link-shot.png' });

  // click the link -> agentforce panel should open
  const clicked = await page.evaluate(() => { const l = document.querySelector('.cell-risk-tooltip-nba-link'); if (!l) return false; l.click(); return true; });
  await sleep(1200);
  const agentOpen = await page.evaluate(() => {
    // heuristic: look for an Agentforce panel/heading
    const t = document.body.innerText;
    return /Agentforce|Next Best Action|Einstein/i.test(t);
  });
  console.log('clicked link:', clicked, '| agentforce content present:', agentOpen);
  await browser.close();
})();
