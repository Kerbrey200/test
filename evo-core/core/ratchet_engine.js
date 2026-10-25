/**
 * EVO-CORE KARPATHY RATCHET ENGINE
 * Implements deterministic micro-iteration loop:
 * Execute Sandbox Test -> Evaluate Metric -> Commit on Improvement / Rollback on Failure.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Gatekeeper } from './gatekeeper.js';

export class RatchetEngine {
  constructor(options = {}) {
    this.repoDir = options.repoDir || process.cwd();
    this.maxConsecutiveFailures = options.maxConsecutiveFailures || 3;
    this.consecutiveFailures = 0;
    this.executionHistory = [];
  }

  /**
   * Captures the current git diff of unstaged/staged changes.
   */
  getGitDiff() {
    try {
      const diffHead = execSync('git diff HEAD -- . ":(exclude)storage/*.sqlite"', { cwd: this.repoDir, encoding: 'utf8' });
      if (diffHead.trim().length > 0) return diffHead;
      
      const diffWorking = execSync('git diff -- . ":(exclude)storage/*.sqlite"', { cwd: this.repoDir, encoding: 'utf8' });
      if (diffWorking.trim().length > 0) return diffWorking;

      // Also check for untracked files
      const status = execSync('git status --porcelain', { cwd: this.repoDir, encoding: 'utf8' });
      if (status.trim().length > 0) return status;

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Reverts all uncommitted changes back to clean working tree.
   * Excludes locked SQLite databases in storage/.
   */
  rollback() {
    try {
      execSync('git checkout -- .', { cwd: this.repoDir, stdio: 'ignore' });
    } catch {}

    try {
      execSync('git clean -fd -e storage/ -e *.sqlite -e *.sqlite-journal', { cwd: this.repoDir, stdio: 'ignore' });
    } catch {}

    return true;
  }

  /**
   * Commits the current verified changes into Git history.
   */
  commit(message) {
    const cleanMessage = Gatekeeper.maskSecrets(message);
    execSync('git add -A', { cwd: this.repoDir, stdio: 'ignore' });
    execSync(`git commit -m "${cleanMessage.replace(/"/g, '\\"')}"`, {
      cwd: this.repoDir,
      stdio: 'ignore'
    });
    const hash = execSync('git rev-parse --short HEAD', { cwd: this.repoDir, encoding: 'utf8' }).trim();
    return hash;
  }

  /**
   * Executes a trial experiment under Karpathy Ratchet protocol.
   * @param {Object} trial
   * @param {string} trial.hypothesis Description of the modification
   * @param {string} trial.testCommand Shell command to verify (e.g. 'node --test')
   * @param {Function} [trial.metricExtractor] Optional function(stdout) -> number
   * @param {number} [trial.baselineScore] Baseline score to beat
   */
  executeTrial({
    hypothesis = 'Micro-optimization trial',
    testCommand,
    metricExtractor = null,
    baselineScore = 0.0,
    timeoutMs = 15000
  }) {
    if (!testCommand) {
      throw new Error('Ratchet execution requires a valid testCommand.');
    }

    const diff = this.getGitDiff();
    if (!diff || diff.trim().length === 0) {
      return {
        success: false,
        action: 'NO_CHANGES',
        message: 'No file changes detected to evaluate.',
        diff: '',
        circuitBreakerTripped: this.consecutiveFailures >= this.maxConsecutiveFailures
      };
    }

    // 1. Anti-Gaming Guard: Audit the diff
    const antiGaming = Gatekeeper.auditDiffForGaming(diff);
    if (!antiGaming.clean) {
      this.rollback();
      this.consecutiveFailures++;
      return {
        success: false,
        action: 'REJECTED_GAMING',
        reasons: antiGaming.findings,
        diff,
        circuitBreakerTripped: this.consecutiveFailures >= this.maxConsecutiveFailures
      };
    }

    // 2. Execute test command in sandbox / repo
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    try {
      stdout = execSync(testCommand, {
        cwd: this.repoDir,
        encoding: 'utf8',
        timeout: timeoutMs
      });
      exitCode = 0;
    } catch (err) {
      exitCode = err.status || 1;
      stdout = err.stdout || '';
      stderr = err.stderr || err.message || '';
    }

    const durationMs = Date.now() - startTime;
    const cleanStdout = Gatekeeper.maskSecrets(stdout);
    const cleanStderr = Gatekeeper.maskSecrets(stderr);

    // 3. Extract and verify metrics
    let computedScore = exitCode === 0 ? 1.0 : 0.0;
    if (exitCode === 0 && typeof metricExtractor === 'function') {
      try {
        computedScore = metricExtractor(stdout);
      } catch {
        computedScore = 0.0;
      }
    }

    // 4. Decision: Ratchet evaluation
    // Success requires: exit code 0 AND score >= baselineScore
    const isImproved = exitCode === 0 && computedScore >= baselineScore;

    let commitHash = null;
    let finalAction = 'ROLLED_BACK';

    if (isImproved) {
      this.consecutiveFailures = 0;
      finalAction = 'COMMITTED';
      commitHash = this.commit(`evocore(ratchet): ${hypothesis} [score: ${computedScore}]`);
    } else {
      this.consecutiveFailures++;
      this.rollback();
    }

    const result = {
      success: isImproved,
      action: finalAction,
      hypothesis,
      score: computedScore,
      baselineScore,
      commitHash,
      exitCode,
      durationMs,
      diff,
      circuitBreakerTripped: this.consecutiveFailures >= this.maxConsecutiveFailures,
      stdout: cleanStdout,
      stderr: cleanStderr
    };

    this.executionHistory.push(result);
    return result;
  }
}
