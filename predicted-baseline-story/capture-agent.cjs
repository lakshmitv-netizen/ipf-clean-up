/* Verify + capture the Arc-3 scripted Agentforce conversation on the Acme grid. */
const puppeteer = require('puppeteer');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
const URL = 'http://localhost:3000/home/manufacturing-acme';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click a starter/recommendation button whose text contains `sub`. */
async function clickText(page, sub) {
  const res = await page.evaluate((sub) => {
    const sels = ['.agentforce-suggestion', '.agentforce-rec-item'];
    for (const sel of sels) {
      const btns = Array.from(document.querySelectorAll(sel));
      const b = btns.find((el) => (el.textContent || '').toLowerCase().includes(sub.toLowerCase()));
      if (b) { b.click(); return { ok: true, sel }; }
    }
    return { ok: false };
  }, sub);
  console.log('click', JSON.stringify(sub), '→', JSON.stringify(res));
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
  await page.waitForSelector('.header-agentforce-trigger', { timeout: 30000 });
  await sleep(800);

  // Open the Agentforce panel.
  await page.click('.header-agentforce-trigger');
  await page.waitForSelector('.agentforce-suggestion', { timeout: 15000 });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'agent-01-starters.png') });
  console.log('shot: agent-01-starters');

  // Kick off Arc 3 and step through the beats via recommendations.
  await clickText(page, 'predict the baseline');
  await page.waitForFunction(() => !document.querySelector('.agentforce-thinking'), { timeout: 8000 }).catch(() => {});
  await sleep(1600);

  const beats = [
    ['project a forward baseline', 'agent-02-project'],
    ['where is the growth', 'agent-03-diverge'],
    ['drill into the midwest', 'agent-04-confidence'],
    ['what should i do', 'agent-05-recommend'],
    ['draft the capacity-risk', 'agent-06-draft'],
  ];
  for (const [sub, shot] of beats) {
    const r = await clickText(page, sub);
    if (!r.ok) { console.log('  (no chip for', sub, ')'); continue; }
    await sleep(1700); // through the "thinking" delay
    await page.screenshot({ path: path.join(OUT, `${shot}.png`) });
    console.log('shot:', shot);
  }

  // Full panel capture of the finished conversation.
  const panel = await page.$('.agentforce-panel');
  if (panel) { await panel.screenshot({ path: path.join(OUT, 'agent-07-full.png') }); console.log('shot: agent-07-full'); }

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
