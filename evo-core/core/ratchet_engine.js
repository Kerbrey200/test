/**
 * EVO-CORE KARPATHY RATCHET ENGINE
 * Deterministic micro-iteration loop with a strict gate order:
 *   scoped diff -> anti-gaming + secret audit -> test run -> parsed evidence
 *   -> metric vs baseline -> promotion gate -> integrity check
 *   -> COMMIT (only the audited files) | ROLLBACK (git stash, recoverable).
 * Nothing is ever committed before every check has passed.
 */

import { Gatekeeper } from './gatekeeper.js';
import { GitWorkspace } from './git_workspace.js';
import { CommandRunner } from './runner.js';
import { TestEvidence } from './evidence.js';

export const TrialAction = Object.freeze({
  COMMITTED: 'COMMITTED',
  ROLLED_BACK: 'ROLLED_BACK',
  REJECTED_GAMING: 'REJECTED_GAMING',
  REJECTED_SECURITY: 'REJECTED_SECURITY',
  REJECTED_GATE: 'REJECTED_GATE',
  COMMIT_FAILED: 'COMMIT_FAILED',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
  NO_CHANGES: 'NO_CHANGES',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN'
});

const FAILURE_STATE_KEY = 'ratchet.consecutiveFailures';

export class RatchetEngine {
  /**
   * @param {object} [options]
   * @param {string} [options.repoDir] Directory the scope is relative to
   * @param {string[]} [options.scope] In-scope pathspecs
   * @param {string[]} [options.exclude] Excluded pathspecs
   * @param {number} [options.maxConsecutiveFailures=3] Circuit breaker threshold
   * @param {boolean} [options.strictImprovement=false] Require score > baseline instead of >=
   * @param {number} [options.timeoutMs=120000] Default test timeout
   * @param {{get(key:string):any, set(key:string, value:any):void}} [options.stateStore]
   *        Persists the circuit breaker across processes
   */
  constructor(options = {}) {
    this.repoDir = options.repoDir || process.cwd();
    this.maxConsecutiveFailures = options.maxConsecutiveFailures || 3;
    this.strictImprovement = Boolean(options.strictImprovement);
    this.timeoutMs = options.timeoutMs || 120000;
    this.maxOutputBytes = options.maxOutputBytes || 1024 * 1024;
    this.historyLimit = options.historyLimit || 100;
    this.stateStore = options.stateStore || null;
    this.workspace = new GitWorkspace({
      repoDir: this.repoDir,
      scope: options.scope || ['.'],
      exclude: options.exclude || []
    });
    this.executionHistory = [];
    this._consecutiveFailures = 0;
  }

  get consecutiveFailures() {
    if (this.stateStore) return Number(this.stateStore.get(FAILURE_STATE_KEY)) || 0;
    return this._consecutiveFailures;
  }

  set consecutiveFailures(value) {
    if (this.stateStore) this.stateStore.set(FAILURE_STATE_KEY, value);
    else this._consecutiveFailures = value;
  }

  get circuitOpen() {
    return this.consecutiveFailures >= this.maxConsecutiveFailures;
  }

  breakerState() {
    const failures = this.consecutiveFailures;
    return { consecutiveFailures: failures, circuitBreakerTripped: failures >= this.maxConsecutiveFailures };
  }

  /**
   * Closes the circuit breaker so trials can run again.
   */
  resetCircuitBreaker() {
    this.consecutiveFailures = 0;
    return this.breakerState();
  }

  /**
   * Returns the unified diff of in-scope changes (empty string when unavailable).
   */
  getGitDiff() {
    try {
      return this.workspace.diff();
    } catch {
      return '';
    }
  }

  /**
   * Moves every in-scope change into a git stash. Out-of-scope files are never touched,
   * and the stashed work can be recovered with `git stash apply <stashRef>`.
   */
  rollback(reason = 'manual rollback') {
    try {
      const files = this.workspace.changedFiles();
      if (files.length === 0) {
        return { success: true, action: 'NOTHING_TO_ROLLBACK', stashRef: null, files: [] };
      }
      const message = Gatekeeper.maskSecrets(`evocore-rollback: ${reason}`).slice(0, 200);
      const stashRef = this.workspace.stashFiles(message, files);
      return { success: true, action: 'ROLLED_BACK', stashRef, files: files.map(f => f.path) };
    } catch (err) {
      return { success: false, action: TrialAction.ROLLBACK_FAILED, error: err.message, stashRef: null, files: [] };
    }
  }

  /**
   * Commits the given (or all in-scope) changes with a masked message.
   */
  commit(message, files = this.workspace.changedFiles()) {
    return this.workspace.commitFiles(Gatekeeper.maskSecrets(message), files);
  }

  record(result) {
    this.executionHistory.push(result);
    if (this.executionHistory.length > this.historyLimit) this.executionHistory.shift();
    return result;
  }

  reject(action, result) {
    const rollback = this.rollback(`${action}: ${result.hypothesis}`);
    this.consecutiveFailures = this.consecutiveFailures + 1;
    return this.record({
      ...result,
      success: false,
      action: rollback.success ? action : TrialAction.ROLLBACK_FAILED,
      rejectedAs: action,
      commitHash: null,
      rollback,
      ...this.breakerState()
    });
  }

  /**
   * Executes a trial experiment under the Karpathy Ratchet protocol.
   * @param {Object} trial
   * @param {string} trial.hypothesis Description of the modification
   * @param {string} trial.testCommand Trusted shell command to verify (e.g. 'npm test')
   * @param {Function} [trial.metricExtractor] Optional (stdout) => number | Promise<number>
   * @param {number} [trial.baselineScore=0] Baseline score to beat
   * @param {number} [trial.timeoutMs] Test timeout
   * @param {Function} [trial.gate] Optional (result) => {pass, reasons, scorecard}, evaluated before commit
   */
  async executeTrial({
    hypothesis = 'Micro-optimization trial',
    testCommand,
    metricExtractor = null,
    baselineScore = 0.0,
    timeoutMs = this.timeoutMs,
    gate = null
  } = {}) {
    if (typeof testCommand !== 'string' || testCommand.trim() === '') {
      throw new Error('Ratchet execution requires a valid testCommand.');
    }
    const baseline = Number(baselineScore);
    if (!Number.isFinite(baseline)) {
      throw new Error('baselineScore must be a finite number.');
    }

    const base = {
      hypothesis: Gatekeeper.maskSecrets(String(hypothesis)).slice(0, 500),
      baselineScore: baseline,
      testCommand: Gatekeeper.maskSecrets(testCommand),
      timeoutMs
    };

    // 0. Circuit breaker: refuse to run while open.
    if (this.circuitOpen) {
      return {
        ...base,
        success: false,
        action: TrialAction.CIRCUIT_OPEN,
        message: `Circuit breaker is open after ${this.consecutiveFailures} consecutive failures. Reset it before running new trials.`,
        diff: '',
        files: [],
        ...this.breakerState()
      };
    }

    this.workspace.assertReady();
    const files = this.workspace.changedFiles();
    if (files.length === 0) {
      return {
        ...base,
        success: false,
        action: TrialAction.NO_CHANGES,
        message: 'No in-scope file changes detected to evaluate.',
        diff: '',
        files: [],
        ...this.breakerState()
      };
    }

    const diff = this.workspace.diff(files);
    const common = {
      ...base,
      diff,
      diffStats: GitWorkspace.diffStats(diff),
      files: files.map(f => f.path)
    };
    const fingerprintBefore = this.workspace.fingerprint(files);

    // 1. Audit the patch before running anything.
    const gaming = Gatekeeper.auditDiffForGaming(diff);
    const secrets = Gatekeeper.scanDiffForSecrets(diff);
    if (!gaming.clean || secrets.length > 0) {
      const findings = [...gaming.findings, ...secrets];
      const action = gaming.clean ? TrialAction.REJECTED_SECURITY : TrialAction.REJECTED_GAMING;
      return this.reject(action, { ...common, findings, reasons: findings });
    }

    // 2. Run the test command asynchronously (event loop stays free).
    const run = await CommandRunner.run(testCommand, {
      cwd: this.repoDir,
      timeoutMs,
      maxOutputBytes: this.maxOutputBytes
    });
    const evidence = TestEvidence.parse(`${run.stdout}\n${run.stderr}`, run.exitCode);

    // 3. Metric extraction.
    let score = 0.0;
    let metricError = null;
    if (run.exitCode === 0) {
      if (typeof metricExtractor === 'function') {
        try {
          score = Number(await metricExtractor(run.stdout));
          if (!Number.isFinite(score)) {
            metricError = 'Metric extractor returned a non-finite value.';
            score = 0.0;
          }
        } catch (err) {
          metricError = `Metric extractor failed: ${err.message}`;
          score = 0.0;
        }
      } else {
        score = 1.0;
      }
    }

    const meetsBaseline = this.strictImprovement ? score > baseline : score >= baseline;
    const executed = {
      ...common,
      score,
      metricError,
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      timedOut: run.timedOut,
      truncated: run.truncated,
      evidence,
      findings: [],
      stdout: Gatekeeper.maskSecrets(run.stdout),
      stderr: Gatekeeper.maskSecrets(run.stderr)
    };

    if (run.exitCode !== 0 || evidence.failed > 0 || metricError !== null || !meetsBaseline) {
      return this.reject(TrialAction.ROLLED_BACK, executed);
    }

    // 4. Promotion gate: decided BEFORE anything is committed.
    let gateResult = { pass: true, reasons: [] };
    if (typeof gate === 'function') {
      try {
        gateResult = (await gate(executed)) || { pass: false, reasons: ['Gate returned no decision.'] };
      } catch (err) {
        gateResult = { pass: false, reasons: [`Gate error: ${err.message}`] };
      }
    }
    executed.gate = gateResult;
    if (!gateResult.pass) {
      return this.reject(TrialAction.REJECTED_GATE, executed);
    }

    // 5. Integrity: the test run must not have rewritten the audited files.
    const fingerprintAfter = this.workspace.fingerprint(files);
    const tampered = Object.keys(fingerprintBefore).filter(p => fingerprintBefore[p] !== fingerprintAfter[p]);
    if (tampered.length > 0) {
      executed.gate = {
        ...gateResult,
        pass: false,
        reasons: [...(gateResult.reasons || []), `Files changed during the test run: ${tampered.join(', ')}`]
      };
      return this.reject(TrialAction.REJECTED_GATE, executed);
    }

    // 6. Commit exactly the audited files.
    let commitHash;
    try {
      commitHash = this.workspace.commitFiles(`evocore(ratchet): ${base.hypothesis.split('\n')[0].slice(0, 200)} [score: ${score}]`, files);
    } catch (err) {
      return this.reject(TrialAction.COMMIT_FAILED, { ...executed, error: err.message });
    }

    this.consecutiveFailures = 0;
    return this.record({
      ...executed,
      success: true,
      action: TrialAction.COMMITTED,
      commitHash,
      ...this.breakerState()
    });
  }
}
