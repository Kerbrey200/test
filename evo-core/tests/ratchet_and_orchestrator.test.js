import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RatchetEngine, TrialAction } from '../core/ratchet_engine.js';
import { EvoCore } from '../core/evocore.js';
import { createGitRepo, git, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "process.exit(1)"';
// Records that the test command actually ran, then passes.
const MARK_AND_PASS = 'node -e "require(\'fs\').writeFileSync(\'ran.marker\', \'1\')"';

const CALC_TEST = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { calculate } from '../src/target_code.js';",
  "test('calculate returns a number', () => { assert.equal(typeof calculate(), 'number'); });",
  ''
].join('\n');

function makeRepo() {
  return createGitRepo({
    'package.json': '{ "type": "module" }\n',
    'src/target_code.js': 'export function calculate() { return 10; }\n',
    'test/calc.test.js': CALC_TEST,
    'notes.txt': 'out of scope\n'
  });
}

const read = (repo, rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const head = (repo) => git(repo, 'rev-parse', 'HEAD');

describe('EvoCore Integrated Tier: Ratchet Engine & Orchestrator', () => {

  after(cleanupTempDirs);

  it('RatchetEngine rolls back on failing test, keeps work recoverable and out-of-scope files intact', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src', 'test'] });
    const before = head(repoDir);

    writeFiles(repoDir, { 'src/target_code.js': 'export function calculate() { return -999; }\n', 'notes.txt': 'user edit\n' });
    const result = await ratchet.executeTrial({ hypothesis: 'Intentional broken calculation', testCommand: FAIL });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, TrialAction.ROLLED_BACK);
    assert.strictEqual(ratchet.consecutiveFailures, 1);
    assert.equal(head(repoDir), before);
    assert.equal(read(repoDir, 'src/target_code.js'), 'export function calculate() { return 10; }\n');
    assert.equal(read(repoDir, 'notes.txt'), 'user edit\n');

    git(repoDir, 'stash', 'apply', result.rollback.stashRef);
    assert.match(read(repoDir, 'src/target_code.js'), /-999/);
  });

  it('RatchetEngine commits only audited in-scope files with real test evidence', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src', 'test'] });
    writeFiles(repoDir, { 'src/target_code.js': 'export function calculate() { return 100; }\n', 'notes.txt': 'user edit\n' });

    const result = await ratchet.executeTrial({ hypothesis: 'Return 100 $(touch PWNED)', testCommand: 'node --test' });

    assert.equal(result.action, TrialAction.COMMITTED);
    assert.equal(result.evidence.framework, 'node:test');
    assert.equal(result.evidence.passed, 1);
    assert.equal(git(repoDir, 'show', '--name-only', '--format=', 'HEAD'), 'src/target_code.js');
    assert.match(git(repoDir, 'log', '-1', '--format=%s'), /\$\(touch PWNED\)/);
    assert.equal(fs.existsSync(path.join(repoDir, 'PWNED')), false);
    assert.equal(read(repoDir, 'notes.txt'), 'user edit\n');
  });

  it('RatchetEngine trips the circuit breaker and then refuses to run trials (regression: Y2)', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src'], maxConsecutiveFailures: 2 });

    writeFiles(repoDir, { 'src/target_code.js': 'export function calculate() { return -1; }\n' });
    await ratchet.executeTrial({ testCommand: FAIL });
    writeFiles(repoDir, { 'src/target_code.js': 'export function calculate() { return -2; }\n' });
    const res2 = await ratchet.executeTrial({ testCommand: FAIL });
    assert.strictEqual(res2.circuitBreakerTripped, true);
    assert.strictEqual(ratchet.consecutiveFailures, 2);

    writeFiles(repoDir, { 'src/target_code.js': 'export function calculate() { return 7; }\n' });
    const blocked = await ratchet.executeTrial({ testCommand: MARK_AND_PASS });
    assert.equal(blocked.action, TrialAction.CIRCUIT_OPEN);
    assert.equal(fs.existsSync(path.join(repoDir, 'ran.marker')), false, 'test command ran while the breaker was open');
    assert.match(read(repoDir, 'src/target_code.js'), /return 7/, 'blocked trial must not touch files');

    ratchet.resetCircuitBreaker();
    const after = await ratchet.executeTrial({ testCommand: PASS });
    assert.equal(after.action, TrialAction.COMMITTED);
  });

  it('RatchetEngine persists the breaker through a state store', async () => {
    const repoDir = makeRepo();
    const store = new Map();
    const stateStore = { get: k => store.get(k), set: (k, v) => store.set(k, v) };
    const first = new RatchetEngine({ repoDir, scope: ['src'], maxConsecutiveFailures: 1, stateStore });
    writeFiles(repoDir, { 'src/target_code.js': 'broken\n' });
    await first.executeTrial({ testCommand: FAIL });

    const second = new RatchetEngine({ repoDir, scope: ['src'], maxConsecutiveFailures: 1, stateStore });
    assert.equal(second.circuitOpen, true);
  });

  it('RatchetEngine reports NO_CHANGES without counting a failure', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src'] });
    const res = await ratchet.executeTrial({ testCommand: PASS });
    assert.equal(res.action, TrialAction.NO_CHANGES);
    assert.equal(ratchet.consecutiveFailures, 0);
  });

  it('RatchetEngine rejects gaming patches before running tests', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src', 'test'] });
    writeFiles(repoDir, { 'test/calc.test.js': CALC_TEST.replace("assert.equal(typeof calculate(), 'number');", '') });

    const res = await ratchet.executeTrial({ testCommand: MARK_AND_PASS });
    assert.equal(res.action, TrialAction.REJECTED_GAMING);
    assert.ok(res.findings.some(f => f.type === 'ASSERTION_WEAKENING'));
    assert.equal(fs.existsSync(path.join(repoDir, 'ran.marker')), false);
    assert.equal(read(repoDir, 'test/calc.test.js'), CALC_TEST);
  });

  it('RatchetEngine rejects patches that add credentials', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src'] });
    writeFiles(repoDir, { 'src/config.js': 'export const githubToken = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";\n' });
    const res = await ratchet.executeTrial({ testCommand: PASS });
    assert.equal(res.action, TrialAction.REJECTED_SECURITY);
    assert.equal(fs.existsSync(path.join(repoDir, 'src/config.js')), false);
  });

  it('RatchetEngine trusts parsed evidence over the exit code and validates metrics', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src'], maxConsecutiveFailures: 10 });

    writeFiles(repoDir, { 'src/target_code.js': 'v1\n' });
    const lying = await ratchet.executeTrial({ testCommand: 'node -e "console.log(\'# tests 2\\n# pass 1\\n# fail 1\')"' });
    assert.equal(lying.action, TrialAction.ROLLED_BACK);
    assert.equal(lying.evidence.failed, 1);

    writeFiles(repoDir, { 'src/target_code.js': 'v2\n' });
    const nan = await ratchet.executeTrial({ testCommand: PASS, metricExtractor: () => 'not a number' });
    assert.equal(nan.action, TrialAction.ROLLED_BACK);
    assert.match(nan.metricError, /non-finite/);

    writeFiles(repoDir, { 'src/target_code.js': 'v3\n' });
    const low = await ratchet.executeTrial({ testCommand: PASS, metricExtractor: () => 0.4, baselineScore: 0.5 });
    assert.equal(low.action, TrialAction.ROLLED_BACK);

    const strict = new RatchetEngine({ repoDir, scope: ['src'], strictImprovement: true });
    writeFiles(repoDir, { 'src/target_code.js': 'v4\n' });
    const equal = await strict.executeTrial({ testCommand: PASS, metricExtractor: () => 0.5, baselineScore: 0.5 });
    assert.equal(equal.action, TrialAction.ROLLED_BACK);
  });

  it('RatchetEngine rejects when the gate fails or the tests rewrite audited files', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src'], maxConsecutiveFailures: 10 });
    const before = head(repoDir);

    writeFiles(repoDir, { 'src/target_code.js': 'gate\n' });
    const gated = await ratchet.executeTrial({ testCommand: PASS, gate: () => ({ pass: false, reasons: ['nope'] }) });
    assert.equal(gated.action, TrialAction.REJECTED_GATE);

    writeFiles(repoDir, { 'src/target_code.js': 'tamper\n' });
    const tampered = await ratchet.executeTrial({
      testCommand: 'node -e "require(\'fs\').appendFileSync(\'src/target_code.js\', \'//sneaky\')"'
    });
    assert.equal(tampered.action, TrialAction.REJECTED_GATE);
    assert.ok(tampered.gate.reasons.some(r => /changed during the test run/.test(r)));
    assert.equal(head(repoDir), before);
  });

  it('RatchetEngine rolls back a timed-out test run', async () => {
    const repoDir = makeRepo();
    const ratchet = new RatchetEngine({ repoDir, scope: ['src'] });
    writeFiles(repoDir, { 'src/target_code.js': 'slow\n' });
    const res = await ratchet.executeTrial({ testCommand: 'node -e "setTimeout(() => {}, 20000)"', timeoutMs: 300 });
    assert.equal(res.action, TrialAction.ROLLED_BACK);
    assert.equal(res.timedOut, true);
  });

  it('EvoCore executes full evolution step with Scorecard and 8-Section Report', async () => {
    const repoDir = makeRepo();
    const evo = new EvoCore({ rootDir: repoDir, config: { scope: ['src', 'test'] } });

    // Modify target code
    writeFiles(repoDir, { 'src/target_code.js': 'export function calculate() { return 100; }\n' });

    // Caller-supplied counts are claims and must be ignored (regression: Y7).
    const step = await evo.executeEvolutionStep({
      taskTitle: 'Optimize calculate function to 100',
      domain: 'MATH_OPTIMIZE',
      hypothesis: 'Updated calculation to return 100',
      testCommand: 'node --test',
      signature: 'OPTIMIZE_CALCULATE_100',
      rootCause: 'Default returned 10 instead of 100',
      rule: 'Always verify target threshold calculation',
      verifiedCode: 'return 100;',
      testsPassed: 0,
      testsTotal: 99
    });

    assert.strictEqual(step.success, true);
    assert.strictEqual(step.action, 'COMMITTED');
    assert.strictEqual(step.scorecard.totalScore, 100);
    assert.strictEqual(step.scorecard.eligibleForPromotion, true);
    assert.strictEqual(step.muse.action, 'CREATED');
    assert.strictEqual(step.autoSkill.action, 'CREATED');

    // Verify 8-Section Report contents
    assert.ok(step.report.includes('Section 1: Executive Contract'));
    assert.ok(step.report.includes('Section 2: Empirical Execution Logs'));
    assert.ok(step.report.includes('Section 3: Unified Git Diff Patch'));
    assert.ok(step.report.includes('Section 4: MUSE Trajectory Trace'));
    assert.ok(step.report.includes('Section 5: AutoSkill Delta'));
    assert.ok(step.report.includes('Section 6: 100-Point Deterministic Scorecard'));
    assert.ok(step.report.includes('Section 7: Invariant Checks & Anti-Gaming'));
    assert.ok(step.report.includes('Section 8: Final Promotion Status'));
    assert.ok(step.report.includes('DECISION: ✔ PROMOTED TO REPOSITORY'));
    assert.ok(step.report.includes('1/1 passed'));

    // Engine data is never part of a ratchet commit (regression: K4).
    const committed = git(repoDir, 'show', '--name-only', '--format=', 'HEAD');
    assert.equal(committed, 'src/target_code.js');

    evo.close();
  });

  it('EvoCore applies the scorecard gate before committing and reports the truth (regression: K5)', async () => {
    const repoDir = makeRepo();
    const evo = new EvoCore({ rootDir: repoDir, config: { scope: ['src'], maxDiffLines: 1, promotionThreshold: 100 } });
    const before = head(repoDir);
    writeFiles(repoDir, { 'src/target_code.js': 'export function calculate() { return 100; }\n// extra line\n' });

    const step = await evo.executeEvolutionStep({ hypothesis: 'big diff', testCommand: PASS });

    assert.equal(step.action, TrialAction.REJECTED_GATE);
    assert.equal(step.scorecard.totalScore, 95);
    assert.equal(head(repoDir), before, 'rejected trial must not leave a commit');
    assert.ok(step.report.includes('DECISION: ✖ REJECTED BY PROMOTION GATE & ROLLED BACK'));
    assert.ok(step.report.includes('git stash apply'));
    evo.close();
  });

  it('EvoCore records regressions only for trials that actually ran (regression: Y3)', async () => {
    const repoDir = makeRepo();
    const evo = new EvoCore({ rootDir: repoDir, config: { scope: ['src'] } });
    evo.memory.recordExperience({ signature: 'S1', winningFix: 'fix' });
    const row = () => evo.memory.db.prepare('SELECT regressions FROM experiences WHERE signature = ?').get('S1');

    const noChange = await evo.executeEvolutionStep({ hypothesis: 'h', testCommand: PASS, signature: 'S1' });
    assert.equal(noChange.action, TrialAction.NO_CHANGES);
    assert.equal(row().regressions, 0);

    writeFiles(repoDir, { 'src/target_code.js': 'broken\n' });
    const failed = await evo.executeEvolutionStep({ hypothesis: 'h', testCommand: FAIL, signature: 'S1' });
    assert.equal(failed.action, TrialAction.ROLLED_BACK);
    assert.equal(row().regressions, 1);
    evo.close();
  });

  it('EvoCore resolves test commands from the configured allowlist', async () => {
    const repoDir = makeRepo();
    const evo = new EvoCore({ rootDir: repoDir, config: { scope: ['src'], testCommands: { quick: PASS } } });
    assert.equal(evo.resolveTestCommand({ testCommandId: 'quick' }), PASS);
    await assert.rejects(() => evo.executeEvolutionStep({ testCommandId: 'missing' }), /Unknown test command id/);
    evo.close();
  });

});
