const puppeteer = require('puppeteer');
const path = require('path');
const HTML = 'file://' + path.join(__dirname, 'report.html');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 905, deviceScaleFactor: 1 } });
  const p = await b.newPage();
  await p.goto(HTML, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 500));
  const pages = await p.$$('.page');
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({ path: path.join(__dirname, 'shots', `page-${i + 1}.png`) });
  }
  await b.close();
  console.log('verify shots done', pages.length);
})();
