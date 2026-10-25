import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { EvoServer } from '../core/server.js';
import { createGitRepo, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

const TOKEN = 'test-token-0123456789';
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' };

function rawRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForJob(baseUrl, jobId) {
  for (let i = 0; i < 200; i++) {
    const job = await (await fetch(`${baseUrl}/api/jobs/${jobId}`, { headers: AUTH })).json();
    if (job.status === 'done' || job.status === 'failed') return job;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
}

describe('EvoCore Native Web Server & REST API Tier', () => {

  // The API mutates git state, so the server runs against a throwaway repo.
  const rootDir = createGitRepo({ 'src/app.js': 'export const v = 1;\n' });
  const server = new EvoServer({
    port: 0,
    rootDir,
    token: TOKEN,
    config: {
      scope: ['src'],
      testCommands: {
        default: 'node -e "console.log(\'# tests 1\\n# pass 1\\n# fail 0\')"',
        slow: 'node -e "setTimeout(() => {}, 1500)"'
      }
    }
  });
  let baseUrl = '';

  before(async () => {
    baseUrl = await server.start();
  });

  after(async () => {
    await server.stop();
    cleanupTempDirs();
  });

  it('starts server and responds to GET / with full control HTML', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('EvoCore Studio'));
    assert.ok(html.includes('Karpathy Ratchet'));
    assert.ok(html.includes('MUSE Episodik'));
  });

  it('serves the UI with a nonce-based CSP and no inline handlers or innerHTML (regression: Y4)', async () => {
    const res = await fetch(`${baseUrl}/`);
    const csp = res.headers.get('content-security-policy');
    const nonce = csp.match(/'nonce-([^']+)'/)[1];
    const html = await res.text();
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.equal((html.match(/<script/g) || []).length, 1);
    assert.ok(!/\son[a-z]+="/i.test(html), 'inline event handler found');
    assert.ok(!html.includes('innerHTML'), 'innerHTML found in UI');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  it('binds to loopback only by default (regression: K1)', () => {
    assert.equal(server.server.address().address, '127.0.0.1');
  });

  it('requires the API token for every /api endpoint except health', async () => {
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/status`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/status`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  });

  it('responds to GET /api/status with valid JSON telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/status`, { headers: AUTH });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.engine.includes('EvoCore'));
    assert.strictEqual(typeof data.activeSkillsCount, 'number');
    assert.strictEqual(typeof data.queue.running, 'boolean');
  });

  it('refuses cross-origin requests and sends no CORS headers (regression: K1)', async () => {
    const res = await fetch(`${baseUrl}/api/status`, { headers: { ...AUTH, Origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), null);

    const preflight = await fetch(`${baseUrl}/api/ratchet/step`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(preflight.status, 403);
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);

    const sameOrigin = await fetch(`${baseUrl}/api/status`, { headers: { ...AUTH, Origin: baseUrl } });
    assert.equal(sameOrigin.status, 200);
  });

  it('rejects foreign Host headers to block DNS rebinding', async () => {
    const res = await rawRequest(`${baseUrl}/api/health`, { headers: { Host: 'evil.example:80' } });
    assert.equal(res.status, 403);
  });

  it('rejects non-JSON and oversized bodies', async () => {
    const plain = await fetch(`${baseUrl}/api/audit/mql`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: 'x' });
    assert.equal(plain.status, 415);

    const big = await rawRequest(`${baseUrl}/api/audit/mql`, {
      method: 'POST',
      headers: { ...JSON_AUTH, Host: new URL(baseUrl).host },
      body: JSON.stringify({ code: 'x'.repeat(2 * 1024 * 1024) })
    });
    assert.equal(big.status, 413);

    const invalid = await fetch(`${baseUrl}/api/audit/mql`, { method: 'POST', headers: JSON_AUTH, body: '{oops' });
    assert.equal(invalid.status, 400);
  });

  it('never runs a command supplied in the request body (regression: K1 RCE)', async () => {
    const marker = path.join(rootDir, 'RCE_PROOF.txt');
    const res = await fetch(`${baseUrl}/api/ratchet/step`, {
      method: 'POST',
      headers: JSON_AUTH,
      body: JSON.stringify({ hypothesis: 'h', testCommand: `node -e "require('fs').writeFileSync('RCE_PROOF.txt','x')"` })
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /testCommand is not accepted/);

    const unknown = await fetch(`${baseUrl}/api/ratchet/step`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ testCommandId: 'rm' }) });
    assert.equal(unknown.status, 400);
    await server.queue.idle();
    assert.equal(fs.existsSync(marker), false);
  });

  it('runs a queued ratchet step from the allowlist and records it in history', async () => {
    writeFiles(rootDir, { 'src/app.js': 'export const v = 2;\n' });
    const res = await fetch(`${baseUrl}/api/ratchet/step`, {
      method: 'POST',
      headers: JSON_AUTH,
      body: JSON.stringify({ taskTitle: 'Bump v', signature: 'BUMP_V', rule: 'Increment v', domain: 'GENERAL' })
    });
    assert.equal(res.status, 202);
    const job = await waitForJob(baseUrl, (await res.json()).jobId);

    assert.equal(job.status, 'done');
    assert.equal(job.result.action, 'COMMITTED');
    assert.ok(job.result.report.includes('PROMOTED'));

    const history = await (await fetch(`${baseUrl}/api/history`, { headers: AUTH })).json();
    assert.equal(history[0].action, 'COMMITTED');

    const skills = await (await fetch(`${baseUrl}/api/skills`, { headers: AUTH })).json();
    assert.equal(skills.length, 1);
    assert.equal(skills[0].path, undefined, 'absolute paths are not exposed');
  });

  it('stays responsive while a long job runs (regression: Y5)', async () => {
    writeFiles(rootDir, { 'src/app.js': 'export const v = 3;\n' });
    const queued = await (await fetch(`${baseUrl}/api/ratchet/step`, {
      method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ testCommandId: 'slow' })
    })).json();

    await new Promise(r => setTimeout(r, 200));
    const started = Date.now();
    const status = await (await fetch(`${baseUrl}/api/status`, { headers: AUTH })).json();
    assert.ok(Date.now() - started < 500, 'status request was blocked');
    assert.equal(status.queue.running, true);

    const job = await waitForJob(baseUrl, queued.jobId);
    assert.equal(job.status, 'done');
  });

  it('responds to POST /api/audit/mql with validation issues', async () => {
    const res = await fetch(`${baseUrl}/api/audit/mql`, {
      method: 'POST',
      headers: JSON_AUTH,
      body: JSON.stringify({ code: 'int start() { int c = IndicatorCounted(); return(0); }' })
    });

    assert.strictEqual(res.status, 200);
    const audit = await res.json();
    assert.strictEqual(audit.passed, false);
    assert.ok(audit.issues.some(i => i.id === 'MQL5-01'));
  });

  it('scans posted source code and validates the extension', async () => {
    const ok = await fetch(`${baseUrl}/api/scan`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ code: 'def f(a):\n    pass\n', ext: '.py' }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).functions[0].name, 'f');

    const bad = await fetch(`${baseUrl}/api/scan`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ code: '', ext: '.exe' }) });
    assert.equal(bad.status, 400);
  });

  it('responds to POST /api/ratchet/rollback successfully', async () => {
    writeFiles(rootDir, { 'src/app.js': 'uncommitted\n' });
    const res = await fetch(`${baseUrl}/api/ratchet/rollback`, { method: 'POST', headers: JSON_AUTH, body: '{}' });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.stashRef);
  });

  it('records manual regressions and resets the circuit breaker', async () => {
    const unknown = await fetch(`${baseUrl}/api/memory/regress`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ signature: 'NOPE' }) });
    assert.equal(unknown.status, 404);

    const known = await fetch(`${baseUrl}/api/memory/regress`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ signature: 'BUMP_V' }) });
    assert.equal(known.status, 200);
    assert.equal(typeof (await known.json()).newUtility, 'number');

    const reset = await fetch(`${baseUrl}/api/circuit/reset`, { method: 'POST', headers: JSON_AUTH, body: '{}' });
    assert.equal((await reset.json()).consecutiveFailures, 0);
  });

  it('runs allowlisted test commands as jobs', async () => {
    const res = await fetch(`${baseUrl}/api/tests/run`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ testCommandId: 'default' }) });
    assert.equal(res.status, 202);
    const job = await waitForJob(baseUrl, (await res.json()).jobId);
    assert.equal(job.result.exitCode, 0);
    assert.match(job.result.output, /# pass 1/);
  });

  it('returns 404 for unknown endpoints and jobs', async () => {
    assert.equal((await fetch(`${baseUrl}/api/nope`, { headers: AUTH })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/jobs/00000000-0000-0000-0000-000000000000`, { headers: AUTH })).status, 404);
    assert.equal((await fetch(`${baseUrl}/nope`)).status, 404);
  });

});
