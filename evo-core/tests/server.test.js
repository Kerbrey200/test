import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EvoServer } from '../core/server.js';
import { createGitRepo, cleanupTempDirs } from './helpers/fixtures.js';

describe('EvoCore Native Web Server & REST API Tier', () => {

  // The rollback endpoint mutates git state, so the server runs against a throwaway repo.
  const server = new EvoServer({ port: 0, rootDir: createGitRepo() });
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

  it('responds to GET /api/status with valid JSON telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.engine.includes('EvoCore'));
    assert.strictEqual(typeof data.activeSkillsCount, 'number');
  });

  it('responds to POST /api/audit/mql with validation issues', async () => {
    const res = await fetch(`${baseUrl}/api/audit/mql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'int start() { int c = IndicatorCounted(); return(0); }' })
    });

    assert.strictEqual(res.status, 200);
    const audit = await res.json();
    assert.strictEqual(audit.passed, false);
    assert.ok(audit.issues.some(i => i.id === 'MQL5-01'));
  });

  it('responds to POST /api/ratchet/rollback successfully', async () => {
    const res = await fetch(`${baseUrl}/api/ratchet/rollback`, {
      method: 'POST'
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

});
