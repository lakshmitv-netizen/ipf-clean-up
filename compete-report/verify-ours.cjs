/* Verify the "our solution" entry renders correctly in the scenario-planning
   competitive analysis page, and capture the three review screenshots. */
const puppeteer = require('puppeteer');
const path = require('path');

const FILE = 'file://' + path.join(__dirname, 'scenario-planning-competitive-analysis.html');
const OUT = path.join(__dirname, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  — ' + detail : ''));
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 1 });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(FILE, { waitUntil: 'networkidle0' });
  await sleep(300);

  const tab = async (name) => {
    await page.click(`.tab[data-tab="${name}"]`);
    await sleep(350);
  };

  /* ---- matrix ---- */
  await tab('matrix');
  const matrix = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('#mhead th')).map((th) => th.textContent.trim());
    const firstTh = document.querySelectorAll('#mhead th')[1];
    const row = document.querySelector('#mbody tr');
    const firstTd = row.querySelector('td');
    return {
      heads,
      firstIsOurs: firstTh.classList.contains('ours'),
      headBg: getComputedStyle(firstTh).backgroundColor,
      cellIsOurs: firstTd.classList.contains('ours'),
      cellBg: getComputedStyle(firstTd).backgroundColor,
      oursCells: document.querySelectorAll('#mbody td.ours').length,
      rows: document.querySelectorAll('#mbody tr').length,
    };
  });
  check('matrix: first data column is Salesforce CPM', matrix.heads[1].startsWith('Salesforce CPM'), matrix.heads.slice(0, 3).join(' | '));
  check('matrix: our header carries .ours highlight', matrix.firstIsOurs && matrix.headBg !== 'rgba(0, 0, 0, 0)', matrix.headBg);
  check('matrix: every cell in our column is tinted', matrix.cellIsOurs && matrix.oursCells === matrix.rows, `${matrix.oursCells}/${matrix.rows} @ ${matrix.cellBg}`);
  check('matrix: 13 columns total (capability + ours + 11 rivals)', matrix.heads.length === 13, String(matrix.heads.length));

  await page.screenshot({ path: path.join(OUT, 'verify-ours-matrix.png'), fullPage: true });

  /* ---- matrix checkboxes ---- */
  await page.click('#onlyStrong');
  await sleep(250);
  const strongOn = await page.evaluate(() => {
    const td = document.querySelector('#mbody td.ours');
    return { tinted: getComputedStyle(td).backgroundColor, dots: document.querySelectorAll('#mbody td.ours span:not(.lvl)').length };
  });
  check('matrix: our column stays tinted with "highlight only Strong" on', strongOn.tinted !== 'rgba(0, 0, 0, 0)', strongOn.tinted);
  await page.click('#onlyStrong');
  await page.click('#onlyDiff');
  await sleep(250);
  const diffOn = await page.evaluate(() => ({
    rows: document.querySelectorAll('#mbody tr').length,
    stakes: document.querySelectorAll('#mbody .t-stake').length,
  }));
  check('matrix: "differentiators & white space only" drops table stakes', diffOn.rows === 11 && diffOn.stakes === 0, `${diffOn.rows} rows, ${diffOn.stakes} stake tags`);
  await page.click('#onlyDiff');
  await sleep(200);

  /* ---- vendors ---- */
  await tab('vendors');
  const vendors = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#vendors .vcard'));
    const first = cards[0];
    return {
      count: cards.length,
      firstName: first.querySelector('h3').textContent.trim(),
      firstBadge: first.querySelector('.badge').textContent.trim(),
      firstBadgeClass: first.querySelector('.badge').className,
      firstIsOurs: first.classList.contains('is-ours'),
      ring: getComputedStyle(first).boxShadow,
      chipCounts: Array.from(document.querySelectorAll('#vfilters .chip')).map((c) => c.textContent.trim().replace(/\s+/g, ' ')),
      note: (document.querySelector('#vfilters .filternote') || {}).textContent || '',
      tabCount: document.querySelector('#vcount').textContent,
    };
  });
  check('vendors: our card is first', vendors.firstName === 'Salesforce CPM', vendors.firstName);
  check('vendors: card shows the Ours badge', vendors.firstBadge === 'Ours' && /b-ours/.test(vendors.firstBadgeClass), vendors.firstBadgeClass);
  check('vendors: card has the accent ring', vendors.firstIsOurs && vendors.ring !== 'none', vendors.ring);
  check('vendors: 12 cards rendered', vendors.count === 12, String(vendors.count));
  check('vendors: class chip counts are competitor-only (sum 11)', /All classes11$/.test(vendors.chipCounts[0]) && vendors.chipCounts.slice(1).reduce((s, c) => s + Number(c.match(/(\d+)$/)[1]), 0) === 11, vendors.chipCounts.join(' / '));
  check('vendors: pinned-note explains the count', /pinned first and always shown/.test(vendors.note), vendors.note);

  await page.screenshot({ path: path.join(OUT, 'verify-ours-vendors.png'), clip: { x: 0, y: 0, width: 1600, height: 1000 } });

  /* ---- class filter behaviour ---- */
  await page.click('#vfilters .chip[data-vcls="ri"]');
  await sleep(250);
  const filtered = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#vendors .vcard'));
    return { n: cards.length, names: cards.map((c) => c.querySelector('h3').textContent.trim()) };
  });
  check('filter: revenue-intel chip keeps ours pinned + 4 rivals', filtered.n === 5 && filtered.names[0] === 'Salesforce CPM', filtered.names.join(', '));
  await page.click('#vfilters .chip[data-vcls="all"]');
  await sleep(200);

  /* ---- screenshots ---- */
  await tab('shots');
  await sleep(500);
  const shots = await page.evaluate(async () => {
    const tiles = Array.from(document.querySelectorAll('#shots .shot'));
    const first = tiles[0];
    const img = first.querySelector('img');
    if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
    return {
      count: tiles.length,
      firstName: first.querySelector('h3').textContent.trim(),
      firstBadge: first.querySelector('.badge').textContent.trim(),
      isOurs: first.classList.contains('is-ours'),
      src: img ? img.getAttribute('src') : null,
      naturalWidth: img ? img.naturalWidth : 0,
      naturalHeight: img ? img.naturalHeight : 0,
      pill: first.querySelector('.pill').textContent.trim(),
      link: first.querySelector('.srclink').textContent.trim(),
      note: document.querySelector('#shotnote').textContent.trim(),
      chips: Array.from(document.querySelectorAll('#sfilters .chip')).map((c) => c.textContent.trim().replace(/\s+/g, ' ')),
    };
  });
  check('shots: our tile is first', shots.firstName === 'Salesforce CPM' && shots.isOurs, shots.firstName);
  check('shots: real image loads (naturalWidth > 0)', shots.naturalWidth > 0, `${shots.src} → ${shots.naturalWidth}×${shots.naturalHeight}`);
  check('shots: tile is labelled as our internal screenshot', /internal screenshot/i.test(shots.pill), shots.pill);
  check('shots: footer link reads "Internal report"', shots.link === 'Internal report ↗', shots.link);
  check('shots: attribution counts competitors only (11 visuals, 10 genuine)', /Of the 11 competitor visuals that follow, 10 are genuine/.test(shots.note), shots.note.slice(0, 210));
  check('shots: attribution flags the first tile as ours', /The first tile is our own product/.test(shots.note));
  check('shots: class chips competitor-only (sum 11)', /All classes11$/.test(shots.chips[0]) && shots.chips.slice(1).reduce((s, c) => s + Number(c.match(/(\d+)$/)[1]), 0) === 11, shots.chips.join(' / '));

  /* ---- modal ---- */
  await page.click('#shots .shot');
  await sleep(450);
  const modal = await page.evaluate(() => {
    const img = document.querySelector('#mcontent .mshot img');
    return {
      on: document.querySelector('#modal').classList.contains('on'),
      badge: document.querySelector('#mbadge').textContent.trim(),
      badgeClass: document.querySelector('#mbadge').className,
      title: document.querySelector('#mtitle').textContent.trim(),
      imgW: img ? img.naturalWidth : 0,
      ratings: document.querySelectorAll('#mcontent .mrow').length,
      strengths: document.querySelectorAll('#mcontent ul')[0].children.length,
      weaknesses: document.querySelectorAll('#mcontent ul')[1].children.length,
      strongRatings: Array.from(document.querySelectorAll('#mcontent .mrow')).filter((r) => r.querySelector('.l3')).length,
    };
  });
  check('modal: opens for our entry with the Ours badge', modal.on && modal.title === 'Salesforce CPM' && /b-ours/.test(modal.badgeClass), `${modal.badge} / ${modal.badgeClass}`);
  check('modal: screenshot renders inside the modal', modal.imgW > 0, String(modal.imgW));
  check('modal: 12 capability ratings, 8 strong', modal.ratings === 12 && modal.strongRatings === 8, `${modal.ratings} rows, ${modal.strongRatings} strong`);
  check('modal: 4 strengths and 4 weaknesses', modal.strengths === 4 && modal.weaknesses === 4, `${modal.strengths}/${modal.weaknesses}`);
  await page.keyboard.press('Escape');
  await sleep(250);

  /* ---- where to win ---- */
  await tab('win');
  const win = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#buckets li'));
    return {
      n: items.length,
      chips: items.length && items.every((li) => li.querySelector('.ourchip')),
      lines: items.map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
      wsSub: document.querySelectorAll('.bucket.ws .sub2')[0].textContent.trim(),
    };
  });
  check('win: every capability line carries an Ours chip', win.n === 12 && win.chips, `${win.n} lines`);
  check('win: white-space wording preserved for genuine gaps', /No competitor has convincingly solved it/.test(win.wsSub) && win.lines.some((l) => /no vendor rated strong/.test(l)), win.wsSub);
  const soloWins = win.lines.filter((l) => /no vendor rated strong/.test(l) && /Ours: Strong/.test(l));
  const oneRival = win.lines.filter((l) => /Ours: Strong/.test(l) && /— strong: [^,]+ Ours:/.test(l));
  console.log('\nUNCONTESTED (no competitor strong, ours strong): ' + (soloWins.length ? '' : 'none'));
  soloWins.forEach((l) => console.log('  • ' + l));
  console.log('\nOURS STRONG WITH A SINGLE COMPETITOR LEADER:');
  oneRival.forEach((l) => console.log('  • ' + l));
  console.log('\nALL WIN LINES:');
  win.lines.forEach((l) => console.log('  - ' + l));

  const winBox = await page.evaluate(() => {
    const r = document.querySelector('#buckets').getBoundingClientRect();
    return { x: 0, y: Math.max(0, r.top + window.scrollY - 90), width: 1600, height: Math.ceil(r.height) + 120 };
  });
  await page.screenshot({ path: path.join(OUT, 'verify-ours-win.png'), clip: winBox });

  /* ---- search ---- */
  await page.type('#q', 'goal-seek');
  await sleep(350);
  const search = await page.evaluate(() => ({
    vcount: document.querySelector('#vcount').textContent,
    scount: document.querySelector('#scount').textContent,
    rows: document.querySelectorAll('#mbody tr').length,
    oursMatches: Array.from(document.querySelectorAll('#vendors .vcard h3')).map((h) => h.textContent.trim()).includes('Salesforce CPM'),
  }));
  check('search: narrows every tab and still matches our entry', Number(search.vcount) > 0 && Number(search.vcount) < 12 && search.rows === 1 && search.oursMatches, `vcount=${search.vcount} scount=${search.scount} matrixRows=${search.rows}`);
  await page.evaluate(() => { const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input')); });
  await sleep(250);
  const reset = await page.evaluate(() => document.querySelector('#vcount').textContent);
  check('search: clears back to 12 entries', reset === '12', reset);

  check('no console or page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
