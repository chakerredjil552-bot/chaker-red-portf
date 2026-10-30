const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 3600, height: 1200 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8770/strip.html');
  await p.waitForFunction(() => window.DONE || window.ERR, null, { timeout: 120000 });
  const err = await p.evaluate(() => window.ERR); if (err) console.log('ERR', err);
  const data = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  require('fs').writeFileSync('strip.png', Buffer.from(data.split(',')[1], 'base64'));
  console.log('done', errs.slice(0, 5));
  await b.close();
})();
