const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const dir = __dirname;
  const htmlPath = 'file://' + path.join(dir, 'grid-cell-design-system.html');
  const outPath = path.join(dir, 'grid-cell-design-system.pdf');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log('PDF written to ' + outPath);
})();
