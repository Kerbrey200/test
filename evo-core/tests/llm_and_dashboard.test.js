import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LLMBridge } from '../core/llm_bridge.js';
import { DashboardGenerator, escapeHtml } from '../core/dashboard_generator.js';
import { EvoCore } from '../core/evocore.js';
import { createTempDir, cleanupTempDirs } from './helpers/fixtures.js';

describe('EvoCore LLM Bridge & Visual Dashboard Tier', () => {

  after(cleanupTempDirs);

  it('LLMBridge generates candidate patch in deterministic offline mock mode', async () => {
    const bridge = new LLMBridge({ provider: 'mock' });

    const candidate = await bridge.generateCandidate({
      taskTitle: 'Update calculation to 100',
      targetFileContent: 'function calculate() { return 10; }',
      instruction: 'Must return 100;'
    });

    assert.ok(candidate.includes('return 100;'));
  });

  it('DashboardGenerator creates valid standalone HTML visual report', () => {
    const rootDir = createTempDir();
    const evo = new EvoCore({ rootDir });
    const outPath = path.join(rootDir, 'dashboard.html');

    const created = DashboardGenerator.generateHTML(evo, outPath);
    assert.strictEqual(created, outPath);
    assert.ok(fs.existsSync(outPath));

    const html = fs.readFileSync(outPath, 'utf8');
    assert.ok(html.includes('EvoCore: Tri-Core Autonomous Evolution Dashboard'));
    assert.ok(html.includes('Faol Ko\'nikmalar Katalogi'));
    assert.ok(html.includes('MUSE Episodik Traektoriya Xotirasi'));

    evo.close();
  });

  it('DashboardGenerator escapes stored data and forbids scripts (regression: Y4)', () => {
    const rootDir = createTempDir();
    const evo = new EvoCore({ rootDir });
    const payload = '<img src=x onerror=alert(1)>';
    evo.memory.recordExperience({ signature: payload, rootCause: `<script>alert(2)</script>`, winningFix: payload });
    evo.skills.distillSkill({ name: 'XSS Skill', description: payload, rule: 'r' });
    evo.memory.recordTrajectory({ hypothesis: payload, action: 'ROLLED_BACK', exitCode: 1 });

    const html = fs.readFileSync(DashboardGenerator.generateHTML(evo, path.join(rootDir, 'd.html')), 'utf8');
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes("content=\"default-src 'none'; style-src 'unsafe-inline'\""));
    evo.close();
  });

  it('escapeHtml covers all HTML metacharacters', () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    assert.equal(escapeHtml(null), '');
  });

});
