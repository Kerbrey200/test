import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RatchetEngine } from '../core/ratchet_engine.js';
import { EvoCore } from '../core/evocore.js';
import { createGitRepo, cleanupTempDirs } from './helpers/fixtures.js';

describe('EvoCore Integrated Tier: Ratchet Engine & Orchestrator', () => {

  // Isolated throwaway repository: the suite never commits into the project itself.
  const repoDir = createGitRepo({ 'src/target_code.js': 'export function calculate() { return 10; }\n' });
  const testTargetFile = path.join(repoDir, 'src', 'target_code.js');
  after(cleanupTempDirs);

  it('RatchetEngine rolls back on failing test and preserves clean state', () => {
    const ratchet = new RatchetEngine({ repoDir });

    // Introduce bad change
    fs.writeFileSync(testTargetFile, 'export function calculate() { return -999; }\n', 'utf8');

    // Run test that fails (exit 1)
    const result = ratchet.executeTrial({
      hypothesis: 'Intentional broken calculation',
      testCommand: 'node -e "process.exit(1)"'
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'ROLLED_BACK');
    assert.strictEqual(ratchet.consecutiveFailures, 1);
  });

  it('RatchetEngine trips circuit breaker after consecutive failures', () => {
    const ratchet = new RatchetEngine({ repoDir, maxConsecutiveFailures: 2 });

    // Failure 1
    fs.writeFileSync(testTargetFile, 'export function calculate() { return -1; }\n', 'utf8');
    ratchet.executeTrial({ testCommand: 'node -e "process.exit(1)"' });

    // Failure 2 -> Trips circuit breaker
    fs.writeFileSync(testTargetFile, 'export function calculate() { return -2; }\n', 'utf8');
    const res2 = ratchet.executeTrial({ testCommand: 'node -e "process.exit(1)"' });

    assert.strictEqual(res2.circuitBreakerTripped, true);
    assert.strictEqual(ratchet.consecutiveFailures, 2);
  });

  it('EvoCore executes full evolution step with Scorecard and 8-Section Report', () => {
    const evo = new EvoCore({ rootDir: repoDir });

    // Modify target code
    fs.writeFileSync(testTargetFile, 'export function calculate() { return 100; }\n', 'utf8');

    // Execute passing step
    const step = evo.executeEvolutionStep({
      taskTitle: 'Optimize calculate function to 100',
      domain: 'MATH_OPTIMIZE',
      hypothesis: 'Updated calculation to return 100',
      testCommand: 'node -e "process.exit(0)"',
      signature: 'OPTIMIZE_CALCULATE_100',
      rootCause: 'Default returned 10 instead of 100',
      rule: 'Always verify target threshold calculation',
      verifiedCode: 'return 100;',
      requirementsMet: 1,
      requirementsTotal: 1,
      testsPassed: 5,
      testsTotal: 5
    });

    assert.strictEqual(step.success, true);
    assert.strictEqual(step.action, 'COMMITTED');
    assert.strictEqual(step.scorecard.totalScore, 100);
    assert.strictEqual(step.scorecard.eligibleForPromotion, true);

    // Verify 8-Section Report contents
    assert.ok(step.report.includes('Section 1: Executive Contract'));
    assert.ok(step.report.includes('Section 2: Empirical Execution Logs'));
    assert.ok(step.report.includes('Section 3: Unified Git Diff Patch'));
    assert.ok(step.report.includes('Section 4: MUSE Trajectory Trace'));
    assert.ok(step.report.includes('Section 5: AutoSkill Delta'));
    assert.ok(step.report.includes('Section 6: 100-Point Deterministic Scorecard'));
    assert.ok(step.report.includes('Section 7: Invariant Checks & Anti-Gaming'));
    assert.ok(step.report.includes('Section 8: Final Promotion Status'));

    evo.close();
  });

});
