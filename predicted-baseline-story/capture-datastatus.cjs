/* Capture the Data Status popover with the Agentforce attribution footer. */
const puppeteer = require('puppeteer');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const URL = 'http://localhost:3000/home/manufacturing-acme';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1680, height: 1000, deviceScaleFactor: 2 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.data-status-pill', { timeout: 30000 });
  await sleep(800);
  await page.hover('.data-status-pill');
  await page.waitForSelector('.data-status-popover', { timeout: 8000 });
  await sleep(600);
  const pop = await page.$('.data-status-popover');
  await pop.screenshot({ path: path.join(OUT, 'datastatus-agent.png') });
  console.log('shot: datastatus-agent');
  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
