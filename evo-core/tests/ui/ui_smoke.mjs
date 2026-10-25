/**
 * EVO-CORE WEB UI SMOKE TEST (real browser)
 * Drives the Studio in Chromium through Playwright: token login, every tab,
 * a ratchet trial, code audit/scan, test run, XSS rendering and CSP violations.
 *
 * Usage: node tests/ui/ui_smoke.mjs [--screenshots <dir>]
 * Skips (exit 0) when Playwright is not installed; it is not a project dependency.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { EvoServer } from '../../core/server.js';
import { createGitRepo, writeFiles, cleanupTempDirs } from '../helpers/fixtures.js';

const { values: args } = parseArgs({ options: { screenshots: { type: 'string' } } });

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('SKIPPED: playwright is not installed (npm i -g playwright && npx playwright install chromium).');
  process.exit(0);
}

const XSS = '<img src=x onerror="window.__xss=1">';
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const rootDir = createGitRepo({ 'src/app.js': 'export const v = 1;\n' });
const server = new EvoServer({
  port: 0,
  rootDir,
  config: { scope: ['src'], testCommands: { default: 'node -e "console.log(\'# tests 3\\n# pass 3\\n# fail 0\')"' } }
});
await server.start();
server.evo.memory.recordExperience({ signature: XSS, rootCause: XSS, winningFix: XSS });

const browser = await chromium.launch();
const shot = async (page, name) => {
  if (!args.screenshots) return;
  fs.mkdirSync(args.screenshots, { recursive: true });
  await page.screenshot({ path: path.join(args.screenshots, `${name}.png`), fullPage: true });
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const problems = [];
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  page.on('console', msg => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  page.on('dialog', dialog => {
    if (dialog.type() === 'alert') problems.push(`alert: ${dialog.message()}`);
    dialog.accept();
  });

  // 1. Login through the URL fragment; the token must disappear from the address bar.
  await page.goto(server.uiUrl);
  await page.waitForFunction(() => document.getElementById('footer-version').textContent.includes('EvoCore v'));
  check('token removed from URL after login', !page.url().includes('token='), page.url());
  await page.waitForFunction(() => document.getElementById('dash-memory-sub').textContent.startsWith('jami'));
  check('dashboard loads counts', (await page.textContent('#dash-memory-sub')) === 'jami: 1');
  await shot(page, '1-dashboard');

  // 2. Stored XSS payload is shown as text, never executed.
  await page.click('[data-tab="memory"]');
  await page.waitForSelector('#memory-table-body code');
  const signatureText = await page.textContent('#memory-table-body code');
  const injectedImages = await page.locator('#memory-table-body img').count();
  check('XSS payload rendered as text', signatureText === XSS && injectedImages === 0);
  check('XSS payload did not execute', !(await page.evaluate(() => window.__xss === 1)));
  await shot(page, '2-memory');

  // 3. Ratchet trial through the form, polled until the report arrives.
  writeFiles(rootDir, { 'src/app.js': 'export const v = 2;\n' });
  await page.click('[data-tab="ratchet"]');
  await page.fill('#r-sig', 'UI_BUMP');
  await page.click('[data-action="run-step"]');
  await page.waitForFunction(() => document.getElementById('r-report-output').textContent.includes('DECISION'), null, { timeout: 30000 });
  const report = await page.textContent('#r-report-output');
  check('ratchet trial promoted via UI', report.includes('PROMOTED TO REPOSITORY'), report.match(/DECISION: .*/)?.[0]);
  await shot(page, '3-ratchet');

  // 4. History, skills.
  await page.click('[data-tab="history"]');
  await page.waitForSelector('#history-table-body .status-pill');
  check('history shows the trial', (await page.textContent('#history-table-body .status-pill')) === 'COMMITTED');
  await page.click('[data-tab="skills"]');
  await page.waitForSelector('#skills-table-body .status-pill');
  check('skill catalogue lists the new skill', (await page.textContent('#skills-table-body')).includes('UI_BUMP'));

  // 5. Code analysis tab.
  await page.click('[data-tab="analyze"]');
  await page.click('[data-action="load-sample"]');
  await page.click('[data-action="audit-mql"]');
  await page.waitForSelector('#analyze-details .issue');
  check('MQL audit lists issues', (await page.locator('#analyze-details .issue').count()) >= 3);
  await shot(page, '4-analyze');
  await page.click('[data-action="scan-ast"]');
  await page.waitForSelector('#analyze-details table');
  check('AST scan lists functions', (await page.textContent('#analyze-details table')).includes('OnInit'));

  // 6. Terminal.
  await page.click('[data-tab="terminal"]');
  await page.click('[data-action="run-tests"]');
  await page.waitForFunction(() => document.getElementById('terminal-output').textContent.includes('exit code'), null, { timeout: 30000 });
  check('test run output shown', (await page.textContent('#terminal-output')).includes('[exit code 0'));

  // 7. A fresh tab without a token sees the token prompt, not data.
  const anonymous = await browser.newPage();
  await anonymous.goto(server.baseUrl);
  await anonymous.waitForSelector('#auth-panel:not(.hidden)');
  check('anonymous visitor is asked for a token', true);
  await anonymous.close();

  // 8. Mobile layout has no horizontal page scroll.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.click('[data-tab="dashboard"]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal scroll at 375px', overflow <= 1, `overflow=${overflow}px`);
  await shot(page, '5-mobile');

  check('no page errors, console errors, CSP violations or alerts', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
  await server.stop();
  cleanupTempDirs();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} UI check(s) failed.`);
  process.exit(1);
}
console.log('\nAll UI checks passed.');
