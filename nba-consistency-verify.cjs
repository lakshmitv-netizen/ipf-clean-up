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
  await page.mouse.move(anchor.x, anchor.y);
  await sleep(500);
  // click the View Next Best Actions link
  await page.evaluate(() => { document.querySelector('.cell-risk-tooltip-nba-link').click(); });
  await sleep(1800);

  const panelText = await page.evaluate(() => {
    // grab agentforce panel text
    const nodes = Array.from(document.querySelectorAll('*')).filter(e => /Agentforce/i.test(e.textContent || '') && e.childElementCount < 40);
    return document.body.innerText;
  });
  // extract the relevant lines
  const hasBelow = /below the committed/i.test(panelText) || /shortfall/i.test(panelText);
  const hasAbove = /above the committed/i.test(panelText) || /e-?motor ramp/i.test(panelText);
  const snippet = (panelText.match(/[^\n]*committed[^\n]*/gi) || []).slice(0, 4);
  console.log('mentions BELOW/shortfall:', hasBelow, '| mentions ABOVE/e-motor:', hasAbove);
  console.log('committed lines:', JSON.stringify(snippet, null, 2));
  await page.screenshot({ path: 'nba-consistency-shot.png' });
  await browser.close();
})();
