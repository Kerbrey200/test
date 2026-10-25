/**
 * EVO-CORE AUTONOMOUS EVOLUTION LOOP
 * context -> LLM candidate -> write target file -> ratchet trial -> feedback -> retry.
 *
 * Safety rules:
 * - the in-scope working tree must be clean before the loop starts, so a rollback can
 *   only ever stash the loop's own candidate;
 * - the target must be an existing, in-scope, non-excluded source file that is not a test;
 * - files whose content would be masked before reaching the LLM (credentials, random
 *   tokens) are refused, because the reply could not restore the original values;
 * - each iteration goes through the full ratchet gate; one MUSE regression is recorded
 *   per failed run, not per iteration;
 * - the loop stops on success, an open circuit breaker, a failed rollback, a
 *   configuration error from the LLM, or when the iteration/time budget is spent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Gatekeeper, REDACTED } from './gatekeeper.js';
import { TrialAction } from './ratchet_engine.js';

const MAX_FEEDBACK_CHARS = 4000;
const STOP_ACTIONS = new Set([TrialAction.CIRCUIT_OPEN, TrialAction.ROLLBACK_FAILED]);

export class EvolveError extends Error {}

/**
 * Builds a metric extractor from a regular expression whose first group is a number.
 */
export function metricFromPattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 200) {
    throw new EvolveError('Metric pattern must be a non-empty regular expression of at most 200 characters.');
  }
  let regex;
  try {
    regex = new RegExp(pattern, 'm');
  } catch (err) {
    throw new EvolveError(`Invalid metric pattern: ${err.message}`);
  }
  return (stdout) => {
    const match = regex.exec(stdout);
    if (!match || match[1] === undefined) throw new Error(`metric pattern /${pattern}/ did not match the test output`);
    return Number(match[1]);
  };
}

/**
 * Condenses a failed trial into feedback the model can act on.
 */
export function summarizeFailure(trial) {
  const lines = [`Result: ${trial.action}`];
  for (const finding of trial.findings || []) lines.push(`- ${finding.type}: ${finding.message}`);
  for (const reason of trial.gate?.reasons || []) lines.push(`- Gate: ${reason}`);
  if (trial.metricError) lines.push(`- Metric: ${trial.metricError}`);
  if (trial.exitCode !== undefined) {
    const evidence = trial.evidence ? `, ${trial.evidence.failed} failed of ${trial.evidence.executed} executed` : '';
    lines.push(`- Test exit code ${trial.exitCode}${trial.timedOut ? ' (timed out)' : ''}${evidence}`);
  }
  if (trial.score !== undefined && trial.baselineScore !== undefined && trial.exitCode === 0) {
    lines.push(`- Score ${trial.score} vs baseline ${trial.baselineScore}`);
  }
  const output = `${trial.stdout || ''}\n${trial.stderr || ''}`.trim();
  if (output) lines.push('Test output (tail):', output.split('\n').slice(-30).join('\n'));
  return lines.join('\n').slice(0, MAX_FEEDBACK_CHARS);
}

function isInside(rel, entry) {
  return entry === '.' || rel === entry || rel.startsWith(`${entry}/`);
}

export class EvolutionLoop {
  /**
   * @param {import('./evocore.js').EvoCore} evo
   * @param {object} options
   * @param {{generateCandidate: Function, describe?: Function}} options.llm Candidate generator (LLMBridge)
   * @param {number} [options.maxIterations=3]
   * @param {number} [options.maxDurationMs=1800000] Wall-clock budget for the whole run
   * @param {number} [options.maxFileBytes=262144]
   * @param {(event: object) => void} [options.onProgress]
   */
  constructor(evo, { llm, maxIterations = 3, maxDurationMs = 30 * 60 * 1000, maxFileBytes = 256 * 1024, onProgress = () => {} } = {}) {
    if (!llm || typeof llm.generateCandidate !== 'function') throw new EvolveError('An LLM candidate generator is required.');
    this.evo = evo;
    this.llm = llm;
    this.maxIterations = maxIterations;
    this.maxDurationMs = maxDurationMs;
    this.maxFileBytes = maxFileBytes;
    this.onProgress = onProgress;
  }

  emit(event) {
    try {
      this.onProgress({ at: new Date().toISOString(), ...event });
    } catch {
      // A broken progress listener must never break the loop.
    }
  }

  /**
   * Validates the target and returns its absolute and project-relative paths.
   */
  resolveTarget(file) {
    if (typeof file !== 'string' || file.trim() === '') throw new EvolveError('A target file is required.');
    const root = this.evo.rootDir;
    const absolute = path.resolve(root, file);
    const rel = path.relative(root, absolute).split(path.sep).join('/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new EvolveError(`Target must be inside the project: ${file}`);

    const { scope, exclude } = this.evo.config;
    if (!scope.some(entry => isInside(rel, entry))) throw new EvolveError(`Target is outside the configured scope (${scope.join(', ')}): ${rel}`);
    if ([...exclude, 'storage', 'skills'].some(entry => isInside(rel, entry))) throw new EvolveError(`Target is excluded from the ratchet: ${rel}`);
    if (Gatekeeper.isTestFile(rel)) throw new EvolveError(`Evolve never rewrites test files: ${rel}`);

    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      throw new EvolveError(`Target file not found: ${rel}`);
    }
    if (!stat.isFile()) throw new EvolveError(`Target is not a file: ${rel}`);
    if (stat.size > this.maxFileBytes) throw new EvolveError(`Target is larger than ${this.maxFileBytes} bytes: ${rel}`);
    return { absolute, rel };
  }

  readTarget(absolute, rel) {
    const buffer = fs.readFileSync(absolute);
    if (buffer.includes(0)) throw new EvolveError(`Target looks binary: ${rel}`);
    return buffer.toString('utf8');
  }

  /**
   * Keeps the file's line-ending style and trailing newline so diffs stay minimal.
   */
  static normalizeCandidate(candidate, original) {
    let text = String(candidate).replace(/\r\n/g, '\n');
    if (original.endsWith('\n') && !text.endsWith('\n')) text += '\n';
    if (original.includes('\r\n')) text = text.replace(/\n/g, '\r\n');
    return text;
  }

  /**
   * Returns a reason string when the candidate must not be written, else null.
   */
  rejectCandidate(candidate, original) {
    if (typeof candidate !== 'string' || candidate.trim() === '') return 'The reply contained no code.';
    if (candidate === original) return 'The candidate was identical to the current file; propose an actual change.';
    if (Buffer.byteLength(candidate) > this.maxFileBytes) return `The candidate exceeds ${this.maxFileBytes} bytes.`;
    if (candidate.includes(REDACTED) && !original.includes(REDACTED)) {
      return `The candidate contains the ${REDACTED} placeholder; never output placeholders.`;
    }
    return null;
  }

  /**
   * Runs the loop. Resolves with a summary; throws EvolveError for invalid requests.
   */
  async run({
    file,
    instruction,
    taskTitle,
    domain = 'GENERAL',
    signature,
    rootCause = '',
    rule = '',
    testCommand,
    testCommandId,
    baselineScore = 0,
    metricPattern,
    maxIterations = this.maxIterations
  } = {}) {
    if (typeof instruction !== 'string' || instruction.trim() === '') throw new EvolveError('An instruction is required.');
    const iterations = Number(maxIterations);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) throw new EvolveError('maxIterations must be an integer between 1 and 20.');

    const { absolute, rel } = this.resolveTarget(file);
    const command = this.evo.resolveTestCommand({ testCommand, testCommandId });
    const metricExtractor = metricPattern ? metricFromPattern(metricPattern) : null;

    const initial = this.readTarget(absolute, rel);
    if (Gatekeeper.maskSecrets(initial) !== initial) {
      throw new EvolveError(`${rel} contains values that are masked before reaching the LLM (credentials or random tokens); move them to configuration first.`);
    }

    const workspace = this.evo.ratchet.workspace;
    workspace.assertReady();
    const dirty = workspace.changedFiles();
    if (dirty.length > 0) {
      throw new EvolveError(`Commit or stash these in-scope changes before evolving: ${dirty.map(f => f.path).slice(0, 10).join(', ')}`);
    }

    const started = Date.now();
    const title = taskTitle || `Evolve ${rel}`;
    const attempts = [];
    const feedback = [];
    let result = null;
    let stoppedReason = 'ITERATIONS_EXHAUSTED';

    this.emit({ type: 'start', file: rel, provider: this.llm.describe?.() || 'custom', maxIterations: iterations });

    for (let iteration = 1; iteration <= iterations; iteration++) {
      if (Date.now() - started > this.maxDurationMs) {
        stoppedReason = 'TIME_BUDGET_EXHAUSTED';
        break;
      }
      if (this.evo.ratchet.circuitOpen) {
        stoppedReason = TrialAction.CIRCUIT_OPEN;
        break;
      }

      const original = this.readTarget(absolute, rel);
      const context = this.evo.prepareTaskContext({ domain, keyword: signature || '' });
      this.emit({ type: 'generating', iteration });

      let candidate;
      try {
        candidate = await this.llm.generateCandidate({
          taskTitle: title,
          targetFileContent: original,
          activeSkills: context.activeSkills,
          priorExperiences: context.priorExperiences,
          previousErrors: feedback.slice(-3),
          instruction
        });
      } catch (err) {
        const message = Gatekeeper.maskSecrets(err.message || String(err));
        attempts.push({ iteration, action: 'LLM_ERROR', error: message });
        this.emit({ type: 'llm_error', iteration, error: message });
        // Client-side configuration errors (bad key, model, request) will not fix themselves.
        if (err.status && err.status >= 400 && err.status < 500 && ![408, 409, 429].includes(err.status)) {
          stoppedReason = 'LLM_CONFIGURATION_ERROR';
          break;
        }
        continue;
      }

      const normalized = typeof candidate === 'string' ? EvolutionLoop.normalizeCandidate(candidate, original) : candidate;
      const rejection = this.rejectCandidate(normalized, original);
      if (rejection) {
        attempts.push({ iteration, action: 'CANDIDATE_REJECTED', error: rejection });
        feedback.push(`Result: CANDIDATE_REJECTED\n- ${rejection}`);
        this.emit({ type: 'candidate_rejected', iteration, reason: rejection });
        continue;
      }

      fs.writeFileSync(absolute, normalized, 'utf8');
      this.emit({ type: 'testing', iteration });

      try {
        result = await this.evo.executeEvolutionStep({
          taskTitle: title,
          domain,
          hypothesis: `${instruction} (evolve ${rel}, iteration ${iteration})`,
          testCommand: command,
          metricExtractor,
          baselineScore,
          signature,
          rootCause,
          rule,
          verifiedCode: normalized.length <= 4000 ? normalized : '',
          recordRegression: false
        });
      } catch (err) {
        // The ratchet never ran to completion: put the original content back.
        fs.writeFileSync(absolute, original, 'utf8');
        throw err;
      }

      const trial = result.ratchet;
      attempts.push({
        iteration,
        action: result.action,
        score: trial.score,
        exitCode: trial.exitCode,
        durationMs: trial.durationMs,
        scorecard: result.scorecard?.totalScore,
        commitHash: trial.commitHash || null,
        stashRef: trial.rollback?.stashRef || null
      });
      this.emit({ type: 'result', iteration, action: result.action, scorecard: result.scorecard?.totalScore, commitHash: trial.commitHash || null });

      if (result.action === TrialAction.COMMITTED) {
        stoppedReason = TrialAction.COMMITTED;
        break;
      }
      if (STOP_ACTIONS.has(result.action)) {
        stoppedReason = result.action;
        break;
      }
      feedback.push(summarizeFailure(trial));
    }

    const success = result?.action === TrialAction.COMMITTED;
    // One run is one hypothesis: record a single regression when the whole run failed.
    let regression = null;
    const tried = attempts.some(a => !['LLM_ERROR', TrialAction.CIRCUIT_OPEN, TrialAction.NO_CHANGES].includes(a.action));
    if (!success && signature && tried) {
      regression = this.evo.recordManualRegression(signature);
    }

    const summary = {
      success,
      file: rel,
      provider: this.llm.describe?.() || 'custom',
      iterations: attempts.length,
      stoppedReason,
      commitHash: success ? result.ratchet.commitHash : null,
      durationMs: Date.now() - started,
      attempts,
      regression,
      report: result?.report || null
    };
    this.emit({ type: 'done', success, stoppedReason, iterations: attempts.length, commitHash: summary.commitHash });
    return summary;
  }
}
