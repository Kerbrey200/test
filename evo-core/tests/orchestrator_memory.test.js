import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { EvoCore } from '../core/evocore.js';
import { TrialAction } from '../core/ratchet_engine.js';
import { createGitRepo, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "process.exit(1)"';

function makeRepo() {
  return createGitRepo({ 'src/app.js': 'export const v = 0;\n' });
}

describe('EvoCore Orchestrator x Memory integration', () => {

  after(cleanupTempDirs);

  it('persists the circuit breaker across EvoCore instances (CLI and server share it)', async () => {
    const rootDir = makeRepo();
    const first = new EvoCore({ rootDir, config: { scope: ['src'], maxConsecutiveFailures: 1 } });
    writeFiles(rootDir, { 'src/app.js': 'broken\n' });
    await first.executeEvolutionStep({ hypothesis: 'fail', testCommand: FAIL });
    first.close();

    const second = new EvoCore({ rootDir, config: { scope: ['src'], maxConsecutiveFailures: 1 } });
    assert.equal(second.getStatus().circuitOpen, true);
    writeFiles(rootDir, { 'src/app.js': 'export const v = 1;\n' });
    const blocked = await second.executeEvolutionStep({ hypothesis: 'blocked', testCommand: PASS });
    assert.equal(blocked.action, TrialAction.CIRCUIT_OPEN);
    assert.ok(blocked.report.includes('CIRCUIT BREAKER OPEN'));

    second.resetCircuitBreaker();
    const ok = await second.executeEvolutionStep({ hypothesis: 'after reset', testCommand: PASS });
    assert.equal(ok.action, TrialAction.COMMITTED);
    second.close();
  });

  it('archives a learned skill after regressions push its utility below 0.5', async () => {
    const rootDir = makeRepo();
    const evo = new EvoCore({ rootDir, config: { scope: ['src'], maxConsecutiveFailures: 10 } });

    writeFiles(rootDir, { 'src/app.js': 'export const v = 2;\n' });
    const learned = await evo.executeEvolutionStep({ hypothesis: 'learn', testCommand: PASS, signature: 'FAST_PATH', rule: 'Use the fast path' });
    assert.equal(learned.autoSkill.action, 'CREATED');
    assert.equal(evo.skills.getActiveSkills().length, 1);

    writeFiles(rootDir, { 'src/app.js': 'regressed\n' });
    const failed = await evo.executeEvolutionStep({ hypothesis: 'apply again', testCommand: FAIL, signature: 'FAST_PATH' });
    assert.equal(failed.muse.action, 'REGRESSION_RECORDED');
    assert.equal(failed.autoSkill.action, 'ARCHIVED');
    assert.equal(evo.skills.getActiveSkills().length, 0);
    assert.equal(evo.skills.getAllSkills().length, 1);
    evo.close();
  });

  it('reports exact status counts and persisted trial history (regression: O1)', async () => {
    const rootDir = makeRepo();
    const evo = new EvoCore({ rootDir, config: { scope: ['src'] } });
    for (let i = 0; i < 7; i++) evo.memory.recordExperience({ signature: `EXP_${i}`, winningFix: 'f' });

    writeFiles(rootDir, { 'src/app.js': 'export const v = 3;\n' });
    await evo.executeEvolutionStep({ hypothesis: 'one', testCommand: PASS });
    await evo.executeEvolutionStep({ hypothesis: 'nothing changed', testCommand: PASS });

    const status = evo.getStatus();
    assert.equal(status.experiencesCount, 7);
    assert.equal(status.historyCount, 1, 'NO_CHANGES is not a trajectory');
    assert.equal(status.circuitOpen, false);
    evo.close();
  });

});
