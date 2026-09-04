/* Render report.html to a PDF using the pages' own 1280x905 size. */
const puppeteer = require('puppeteer');
const path = require('path');

const HTML = 'file://' + path.join(__dirname, 'report.html');
const OUT = path.join(__dirname, 'Predicted-Baseline-Quantity-Story.pdf');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500)); // let inline SVG charts render
  await page.pdf({
    path: OUT,
    printBackground: true,
    width: '1280px',
    height: '905px',
  });
  await browser.close();
  console.log('PDF:', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
