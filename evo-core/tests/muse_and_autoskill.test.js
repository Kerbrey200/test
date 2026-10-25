import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MUSEMemory } from '../core/muse_memory.js';
import { AutoSkillDistiller } from '../core/autoskill_distiller.js';
import { createTempDir, cleanupTempDirs } from './helpers/fixtures.js';

describe('EvoCore Dual Tier: MUSE Memory & AutoSkill Distiller', () => {

  const tempDir = createTempDir();
  const testDb = path.join(tempDir, 'test_muse.sqlite');
  const testSkillsDir = path.join(tempDir, 'skills');
  after(cleanupTempDirs);

  it('MUSE records new experience with initial utility score 1.0', () => {
    const memory = new MUSEMemory(testDb);

    const rec = memory.recordExperience({
      domain: 'MQL_TRADING',
      signature: 'MQL5_ARRAY_OUT_OF_RANGE',
      rootCause: 'ArraySetAsSeries was omitted on rate buffer',
      failedAttempts: ['ResizeArray', 'CopyRates'],
      winningFix: 'ArraySetAsSeries(buffer, true) in OnInit'
    });

    assert.strictEqual(rec.action, 'CREATED');
    assert.strictEqual(rec.utilityScore, 1.0);

    const found = memory.findRelevantExperiences('ArraySetAsSeries', 'MQL_TRADING');
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].signature, 'MQL5_ARRAY_OUT_OF_RANGE');

    memory.close();
  });

  it('MUSE updates hits and increments utility score on repeated success', () => {
    const memory = new MUSEMemory(testDb);

    const updated = memory.recordExperience({
      domain: 'MQL_TRADING',
      signature: 'MQL5_ARRAY_OUT_OF_RANGE',
      rootCause: 'Same root cause verified again',
      winningFix: 'ArraySetAsSeries(buffer, true) in OnInit'
    });

    assert.strictEqual(updated.action, 'UPDATED');
    assert.strictEqual(updated.utilityScore, 1.0);

    // Now report regression
    const newUtility = memory.reportRegression('MQL5_ARRAY_OUT_OF_RANGE');
    // hits=2, regressions=1, total_uses=3 => (2 - 2) / 3 = 0.0
    assert.strictEqual(newUtility, 0.0);

    memory.close();
  });

  it('AutoSkill distills experience into versioned Skill.md file', () => {
    const distiller = new AutoSkillDistiller(testSkillsDir);

    const result = distiller.distillSkill({
      name: 'MQL5 Buffer Invariant',
      description: 'Ensures correct time series indexing for MQL5 indicator buffers',
      domain: 'MQL_TRADING',
      rootCause: 'Indicator buffers index from 0 to N unless reversed',
      rule: 'Always set ArraySetAsSeries(buffer, true) inside OnInit',
      verifiedCode: 'ArraySetAsSeries(rates, true);',
      utilityScore: 1.0
    });

    assert.strictEqual(result.action, 'CREATED');
    assert.strictEqual(result.version, '1.0.0');
    assert.ok(fs.existsSync(result.filePath));

    // Distill again -> should bump version to 1.1.0 (Deduplication)
    const update = distiller.distillSkill({
      name: 'MQL5 Buffer Invariant',
      description: 'Updated invariant with safety check',
      domain: 'MQL_TRADING',
      rule: 'Always check return code of ArraySetAsSeries',
      utilityScore: 0.95
    });

    assert.strictEqual(update.action, 'UPDATED');
    assert.strictEqual(update.version, '1.1.0');

    // Retrieve active skills
    const active = distiller.getActiveSkills('MQL_TRADING');
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].version, '1.1.0');
  });

});
