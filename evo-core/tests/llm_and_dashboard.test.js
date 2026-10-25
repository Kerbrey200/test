import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LLMBridge } from '../core/llm_bridge.js';
import { DashboardGenerator } from '../core/dashboard_generator.js';
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

});
