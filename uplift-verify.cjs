const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1900, height: 1200 });
  await p.goto('http://localhost:3000/home/df-demo', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3500);

  const result = await p.evaluate(() => {
    const want = [
      'Sales Agreement Quant',
      'Order Quantity (No',
      'Predictive Forecaste',
      'Predicted Forecaste',
    ];
    const out = {};
    // Each measure row: find the label cell, then the FY26 numeric cell in the same row.
    const rowNodes = Array.from(document.querySelectorAll('div,tr')).filter(el => {
      const t = (el.innerText || '').trim();
      return want.some(w => t.startsWith(w)) && el.querySelectorAll('*').length < 400;
    });
    rowNodes.forEach(el => {
      const label = want.find(w => (el.innerText || '').trim().startsWith(w));
      if (!label || out[label]) return;
      const nums = (el.innerText.match(/[\d,]{3,}/g) || []);
      out[label] = nums[0] || '(none)';
    });
    return out;
  });
  console.log('FY26 top-line values:', JSON.stringify(result, null, 2));
  const redCount = await p.evaluate(() => document.querySelectorAll('.cell-risk-warning:not(.cell-risk-warning--associated)').length);
  console.log('anchor red markers visible:', redCount);
  await b.close();
})();
