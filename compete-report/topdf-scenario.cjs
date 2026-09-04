/* Render scenario-planning-competitive-analysis.html to a shareable PDF.
   The page is a tabbed app, so every panel is revealed and the tab bar and
   search are dropped before printing. */
const puppeteer = require('puppeteer');
const path = require('path');

const HTML = 'file://' + path.join(__dirname, 'scenario-planning-competitive-analysis.html');
const OUT = path.join(__dirname, 'Scenario-Planning-Competitive-and-Persona-Analysis.pdf');

const TAB_LABELS = {
  overview: 'Overview',
  vendors: 'Vendor profiles',
  shots: 'Screenshots',
  matrix: 'Capability matrix',
  personas: 'Personas',
  win: 'Where to win',
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 60000 });

  await page.evaluate((labels) => {
    // The companion-report callout points at a sibling HTML file, which is dead weight in a PDF.
    document.querySelectorAll('.xref').forEach((el) => el.remove());

    document.querySelectorAll('.panel').forEach((p) => {
      p.hidden = false;
      const key = p.id.replace('panel-', '');
      const h = document.createElement('h2');
      h.className = 'pdf-section';
      h.textContent = labels[key] || key;
      p.parentNode.insertBefore(h, p);
    });
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => i.setAttribute('loading', 'eager'));

    const css = document.createElement('style');
    css.textContent = `
      .toolbar{display:none !important}
      header.top{position:static !important;backdrop-filter:none !important}
      .pdf-section{
        margin:26px 0 14px;padding:8px 12px;border-radius:8px;
        font-size:17px;letter-spacing:-.01em;color:#fff;background:#6b3fd4;
        break-after:avoid;page-break-after:avoid;
      }
      .pdf-section:first-of-type{margin-top:0}
      .card,.shot,section.block,figure,tr{break-inside:avoid;page-break-inside:avoid}
      h2.blk{break-after:avoid;page-break-after:avoid}
    `;
    document.head.appendChild(css);
  }, TAB_LABELS);

  await page.evaluate(async () => {
    const wait = (i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); });
    await Promise.all(Array.from(document.images).map((i) => (i.complete ? null : wait(i))));
  });
  await new Promise((r) => setTimeout(r, 800));

  const broken = await page.evaluate(
    () => document.images.length + '|' + Array.from(document.images).filter((i) => !i.naturalWidth).length,
  );
  console.log('images (total|broken):', broken);

  await page.pdf({
    path: OUT,
    printBackground: true,
    width: '1400px',
    height: '990px',
    margin: { top: '24px', bottom: '24px', left: '20px', right: '20px' },
  });
  await browser.close();
  console.log('PDF:', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
