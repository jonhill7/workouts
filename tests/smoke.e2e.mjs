// End-to-end smoke test: drives the real app in headless Chromium.
// boot → log a set → CSV import → graph → CSV export → offline reload.
//
// Run: node tests/smoke.e2e.mjs
// Needs the `playwright` package and a Chromium it can launch. CI installs
// both (see .github/workflows/deploy.yml); locally `npm i --no-save playwright`
// then `npx playwright install chromium` if you don't already have them.
//
// Deliberately not named *.test.mjs, so the fast unit-test loop skips it.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

// createRequire so a globally installed playwright (NODE_PATH) also resolves;
// ESM `import` ignores NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', 'app');
const FIXTURES = join(HERE, 'fixtures');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};

function serve() {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(APP, path));
    if (!file.startsWith(APP)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let passed = 0;
async function step(name, fn) {
  await fn();
  passed++;
  console.log('  ✓', name);
}

const server = await serve();
// Service workers need a secure context; http://localhost counts as one.
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await step('boots to an empty log with the seeded catalog', async () => {
    await page.goto(base);
    await page.getByText('Workout log is empty.').waitFor();
    assert.equal(await page.locator('.topbar-title').textContent(), 'Workout Log');
  });

  await step('logs a set and shows it on the day', async () => {
    await page.click('#fab-add');
    await page.fill('#ex-search', 'barbell squat');
    await page.locator('.picker-row[data-name="barbell squat"]').click();
    await page.fill('#in-weight', '100');
    await page.fill('#in-reps', '5');
    await page.click('#btn-save');
    await page.locator('#tab-content .set-row').first().waitFor();
    await page.click('[data-nav=back]'); // track → picker
    await page.click('[data-nav=back]'); // picker → home
    await page.locator('.wgroup-name', { hasText: 'Barbell Squat' }).waitFor();
  });

  await step('imports a FitNotes CSV', async () => {
    await page.click('#settings-btn');
    await page.setInputFiles('#file-csv', join(FIXTURES, 'fitnotes-new-format.csv'));
    const done = page.locator('.modal-body', { hasText: 'sets imported' });
    await done.waitFor();
    assert.match(await done.textContent(), /[1-9]\d* sets imported/);
    await page.click('[data-act=ok]');
  });

  await step('graphs an imported exercise', async () => {
    await page.click('[data-nav=back]'); // settings → home
    await page.click('#fab-add');
    await page.fill('#ex-search', 'overhead press');
    await page.locator('.picker-row[data-name="overhead press"]').click();
    await page.click('[data-tab=graph]');
    await page.locator('#chart svg').waitFor();
  });

  await step('exports a CSV containing the logged and imported sets', async () => {
    await page.click('[data-nav=back]');
    await page.click('[data-nav=back]');
    await page.click('#settings-btn');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-csv')]);
    const csv = await readFile(await download.path(), 'utf8');
    assert.match(csv.split('\n')[0], /^Date,Exercise,Category/);
    assert.ok(csv.includes('Barbell Squat'), 'logged set exported');
    assert.ok(csv.includes('Overhead Press'), 'imported set exported');
  });

  await step('reloads offline from the service worker precache', async () => {
    // Wait until the worker controls the page, so the reload is served by it.
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    }
    await context.setOffline(true);
    errors.length = 0;
    await page.reload();
    // A file missing from sw.js's ASSETS fails its module import here.
    await page.locator('.wgroup-name, .empty-state').first().waitFor();
    assert.equal(await page.locator('.topbar-title').textContent(), 'Workout Log');
    await context.setOffline(false);
  });

  await step('no page errors', async () => {
    assert.deepEqual(errors, []);
  });

  console.log(`\nsmoke: ${passed} passed`);
} finally {
  await browser.close();
  server.close();
}
