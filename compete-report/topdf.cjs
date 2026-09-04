/* Render report.html to a PDF using the pages' own 1280x905 size. */
const puppeteer = require('puppeteer');
const path = require('path');

const HTML = 'file://' + path.join(__dirname, 'report.html');
const OUT = path.join(__dirname, 'Scenario-Planning-Competitive-Analysis.pdf');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.pdf({
    path: OUT,
    printBackground: true,
    width: '1280px',
    height: '905px',
    pageRanges: '',
  });
  await browser.close();
  console.log('PDF:', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
