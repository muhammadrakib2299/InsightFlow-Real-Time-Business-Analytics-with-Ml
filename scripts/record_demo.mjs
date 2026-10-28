// Records a short dashboard walkthrough for the README demo GIF.
// Needs the stack on localhost plus DEMO_EMAIL, DEMO_PASSWORD, DASH and OUT.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const { DEMO_EMAIL, DEMO_PASSWORD, DASH, OUT } = process.env;
const viewport = { width: 1280, height: 800 };
const dashboardUrl = `${BASE}/dashboards/${DASH}`;
mkdirSync(`${OUT}/video`, { recursive: true });

const browser = await chromium.launch();

// Log in once; tokens live in localStorage, so storageState carries them over.
const login = await browser.newContext({ viewport, colorScheme: 'dark' });
const lp = await login.newPage();
await lp.goto(`${BASE}/login`);
await lp.fill('input[type="email"]', DEMO_EMAIL);
await lp.fill('input[type="password"]', DEMO_PASSWORD);
await lp.click('button[type="submit"]');
await lp.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
const storageState = await login.storageState();
await lp.screenshot({ path: `${OUT}/after-login.png` });
await login.close();

// Warm the server-side caches so the recording doesn't open on spinners.
const warm = await browser.newContext({ viewport, colorScheme: 'dark', storageState });
const wp = await warm.newPage();
await wp.goto(dashboardUrl);
await wp.waitForLoadState('networkidle');
await wp.waitForTimeout(8_000);
await wp.screenshot({ path: `${OUT}/dashboard-full.png`, fullPage: true });
await warm.close();

const rec = await browser.newContext({
  viewport,
  colorScheme: 'dark',
  storageState,
  recordVideo: { dir: `${OUT}/video`, size: viewport },
});
const page = await rec.newPage();
await page.goto(dashboardUrl);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3_500);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(1_400);
}
await page.waitForTimeout(1_500);
await page.goto(`${BASE}/models`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3_000);
await page.screenshot({ path: `${OUT}/models.png` });
await rec.close();
await browser.close();
