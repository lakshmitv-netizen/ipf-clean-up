const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MONTHS = ['jan2026','feb2026','mar2026','apr2026','may2026','jun2026','jul2026','aug2026','sep2026','oct2026','nov2026','dec2026'];
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 2400, height: 1200 });
  await p.goto('http://localhost:3000/home/df-demo', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3500);
  const read = async (rowId) => {
    return await p.evaluate((rowId, MONTHS) => {
      const out = {};
      MONTHS.forEach(mk => {
        const el = document.querySelector(`[data-cell-key="${rowId}-${mk}"]`);
        if (el) {
          const n = parseInt((el.innerText || '').replace(/[^\d-]/g, ''), 10);
          out[mk] = Number.isFinite(n) ? n : null;
        } else out[mk] = null;
      });
      return out;
    }, rowId, MONTHS);
  };
  const order = await read('measure-order-qty');
  const sa = await read('measure-sa-qty');
  const pred = await read('measure-pred-forecast-qty');
  console.log('month   order     SA   (SA/ord)   pred  (pred/ord)');
  MONTHS.forEach(mk => {
    const o = order[mk], s = sa[mk], pr = pred[mk];
    const sr = o ? (s / o) : NaN, prr = o ? (pr / o) : NaN;
    const flag = (Math.abs(sr - 1) > 0.05 || Math.abs(prr - 1) > 0.05) ? '  <-- deviation' : '';
    console.log(
      `${mk.slice(0,3)}  ${String(o).padStart(6)} ${String(s).padStart(6)}   ${sr.toFixed(3)}  ${String(pr).padStart(6)}   ${prr.toFixed(3)}${flag}`
    );
  });
  await b.close();
})();
