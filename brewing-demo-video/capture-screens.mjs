/**
 * Capture full-res screenshots of the Brewing app for the demo video.
 * Run: node capture-screens.mjs
 * Requires the Vite dev server running on port 5173.
 */
import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';
import path from 'path';

const BASE = 'http://localhost:5173';
const OUT  = './public/screens';
const W    = 1920;
const H    = 1080;

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), type: 'png' });
  console.log(`✓ ${name}.png`);
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Landing page ──────────────────────────────────────────────────────────────
console.log('\n── Landing page ──');
const landing = await browser.newPage();
await landing.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 });
await wait(2000);
await shot(landing, '01-landing-hero');

await landing.evaluate(() => window.scrollTo(0, 600));
await wait(500);
await shot(landing, '02-landing-shift');

await landing.evaluate(() => window.scrollTo(0, 1400));
await wait(500);
await shot(landing, '03-landing-problem');

await landing.evaluate(() => window.scrollTo(0, 2200));
await wait(500);
await shot(landing, '04-landing-coordination');

await landing.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await wait(500);
await shot(landing, '05-landing-bottom');

await landing.close();

// ── Job Board (/app) ──────────────────────────────────────────────────────────
console.log('\n── Job Board ──');
const app = await browser.newPage();
await app.goto(`${BASE}/app`, { waitUntil: 'networkidle2', timeout: 30000 });
await wait(4000); // wait for chain data to load

await shot(app, '06-jobboard-full');

// Click a completed job to show detail panel
const jobRows = await app.$$('[style*="cursor: pointer"]');
if (jobRows.length > 0) {
  await jobRows[0].click();
  await wait(800);
  await shot(app, '07-jobboard-detail');
}

// Click "Open" filter
const filterBtns = await app.$$('button');
for (const btn of filterBtns) {
  const txt = await btn.evaluate(el => el.textContent?.trim() ?? '');
  if (txt.startsWith('Open')) { await btn.click(); await wait(600); break; }
}
await shot(app, '08-jobboard-open-filter');

// Reset to All and show activity feed / leaderboard
for (const btn of await app.$$('button')) {
  const txt = await btn.evaluate(el => el.textContent?.trim() ?? '');
  if (txt.startsWith('All')) { await btn.click(); await wait(400); break; }
}

// Click Leaderboard tab
for (const btn of await app.$$('button')) {
  const txt = await btn.evaluate(el => el.textContent?.trim() ?? '');
  if (txt.toLowerCase().includes('leaderboard')) { await btn.click(); await wait(600); break; }
}
await shot(app, '09-jobboard-leaderboard');

// Back to Activity feed
for (const btn of await app.$$('button')) {
  const txt = await btn.evaluate(el => el.textContent?.trim() ?? '');
  if (txt.toLowerCase().includes('activity')) { await btn.click(); await wait(400); break; }
}

// Click "+ Post Job" to show form
for (const btn of await app.$$('button')) {
  const txt = await btn.evaluate(el => el.textContent?.trim() ?? '');
  if (txt.includes('Post Job')) { await btn.click(); await wait(600); break; }
}
await shot(app, '10-post-job-form');

// Close form and show Run Demo button highlighted
for (const btn of await app.$$('button')) {
  const txt = await btn.evaluate(el => el.textContent?.trim() ?? '');
  if (txt.includes('Cancel') || txt.includes('×') || txt.includes('Close')) {
    await btn.click(); await wait(400); break;
  }
}
await shot(app, '11-jobboard-run-demo');

await app.close();

// ── Admin Dashboard ──────────────────────────────────────────────────────────
console.log('\n── Admin Dashboard ──');
const admin = await browser.newPage();
await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
await wait(4000);
await shot(admin, '12-admin-top');

await admin.evaluate(() => window.scrollTo(0, 500));
await wait(400);
await shot(admin, '13-admin-status-breakdown');

await admin.evaluate(() => window.scrollTo(0, 1100));
await wait(400);
await shot(admin, '14-admin-jobs-table');

await admin.close();

await browser.close();
console.log('\n✅ All screenshots saved to', OUT);
