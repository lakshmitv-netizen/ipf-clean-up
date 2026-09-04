const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 905, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, 'report.html'), { waitUntil: 'networkidle0' });
  const secs = await p.$$('.page');
  for (const idx of [1, 4, 8]) {
    await secs[idx].screenshot({ path: path.join(__dirname, 'shots', 'verify-' + idx + '.png') });
  }
  await b.close();
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
