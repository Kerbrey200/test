/**
 * EVO-CORE ORCHESTRATOR
 * The unified master interface uniting Karpathy Ratchet, MUSE Memory, and AutoSkill Distiller.
 */

import path from 'node:path';
import { Gatekeeper } from './gatekeeper.js';
import { ASTScanner } from './ast_scanner.js';
import { RatchetEngine, TrialAction } from './ratchet_engine.js';
import { MUSEMemory } from './muse_memory.js';
import { AutoSkillDistiller } from './autoskill_distiller.js';
import { EvidenceReporter } from './reporter.js';
import { loadConfig } from './config.js';
import { VERSION } from './version.js';

// Outcomes where the hypothesis was actually tried and failed: these count as regressions.
const REGRESSION_ACTIONS = new Set([
  TrialAction.ROLLED_BACK,
  TrialAction.REJECTED_GAMING,
  TrialAction.REJECTED_SECURITY,
  TrialAction.REJECTED_GATE,
  TrialAction.COMMIT_FAILED,
  TrialAction.ROLLBACK_FAILED
]);

export class EvoCore {
  /**
   * @param {object} [options]
   * @param {string} [options.rootDir] Project root (defaults to cwd)
   * @param {object} [options.config] Overrides for evocore.config.json
   */
  constructor(options = {}) {
    this.rootDir = path.resolve(options.rootDir || process.cwd());
    this.config = loadConfig(this.rootDir, options.config);
    this.storageDir = path.join(this.rootDir, 'storage');
    this.skillsDir = path.join(this.rootDir, 'skills');

    this.memory = new MUSEMemory(path.join(this.storageDir, 'memory.sqlite'));
    this.skills = new AutoSkillDistiller(this.skillsDir);
    this.ratchet = new RatchetEngine({
      // Circuit breaker survives restarts and is shared by the CLI and the web server.
      stateStore: { get: key => this.memory.getState(key), set: (key, value) => this.memory.setState(key, value) },
      repoDir: this.rootDir,
      scope: this.config.scope,
      // Engine data must never be evaluated, committed or rolled back as a candidate change.
      exclude: [...this.config.exclude, 'storage', 'skills'],
      maxConsecutiveFailures: this.config.maxConsecutiveFailures,
      strictImprovement: this.config.strictImprovement,
      timeoutMs: this.config.timeoutMs,
      maxOutputBytes: this.config.maxOutputBytes
    });
  }

  /**
   * Prepares contextual intelligence for a task:
   * 1. AST scan of target file (if exists)
   * 2. Active, high-utility skills from AutoSkill
   * 3. Prior similar experiences from MUSE Memory
   */
  prepareTaskContext({ filePath = null, domain = 'GENERAL', keyword = '' }) {
    let astData = null;
    if (filePath) {
      try {
        astData = ASTScanner.scanFile(filePath);
      } catch (e) {
        astData = { error: e.message };
      }
    }

    const activeSkills = this.skills.getActiveSkills(domain);
    const priorExperiences = this.memory.findRelevantExperiences(keyword, domain);

    return {
      domain,
      filePath,
      ast: astData,
      activeSkills,
      priorExperiences,
      skillsCount: activeSkills.length,
      experiencesCount: priorExperiences.length
    };
  }

  /**
   * Resolves the command to run: an explicit (trusted) command, or an id from the config allowlist.
   */
  resolveTestCommand({ testCommand, testCommandId } = {}) {
    if (typeof testCommand === 'string' && testCommand.trim() !== '') return testCommand;
    const id = testCommandId || 'default';
    const command = this.config.testCommands[id];
    if (!command) throw new Error(`Unknown test command id "${id}". Allowed: ${Object.keys(this.config.testCommands).join(', ')}`);
    return command;
  }

  /**
   * Builds the 100-point scorecard purely from measured evidence of a trial.
   */
  buildScorecard(trial) {
    if (trial.exitCode === undefined || !trial.evidence) {
      return { totalScore: 0.0, eligibleForPromotion: false, promotionThreshold: this.config.promotionThreshold };
    }

    const securityClean = !(trial.findings && trial.findings.length > 0);
    const meetsBaseline = this.config.strictImprovement
      ? trial.score > trial.baselineScore
      : trial.score >= trial.baselineScore;
    const requirements = [
      trial.exitCode === 0,
      trial.evidence.failed === 0,
      trial.metricError === null && meetsBaseline,
      securityClean
    ];

    return Gatekeeper.evaluateScorecard({
      requirementsMet: requirements.filter(Boolean).length,
      requirementsTotal: requirements.length,
      compileOk: trial.exitCode === 0,
      testsPassed: trial.evidence.passed,
      testsTotal: trial.evidence.executed,
      zeroSecurityViolations: securityClean,
      modularCode: (trial.diffStats?.total ?? 0) <= this.config.maxDiffLines,
      withinResourceBudget: !trial.timedOut && trial.durationMs <= trial.timeoutMs / 2,
      promotionThreshold: this.config.promotionThreshold
    });
  }

  /**
   * Executes a full closed-loop evolution trial:
   * Ratchet (audit -> test -> evidence -> scorecard gate -> commit/rollback)
   * -> MUSE Reflection -> AutoSkill Distillation -> 8-Section Report.
   * The scorecard is computed from parsed test output; caller-supplied counts are ignored.
   */
  async executeEvolutionStep({
    taskTitle = 'Autonomous Task',
    domain = 'GENERAL',
    hypothesis,
    testCommand,
    testCommandId,
    metricExtractor = null,
    baselineScore = 0.0,
    timeoutMs,
    signature,
    rootCause = '',
    rule = '',
    verifiedCode = ''
  } = {}) {
    const command = this.resolveTestCommand({ testCommand, testCommandId });
    const cleanSignature = typeof signature === 'string' && signature.trim() ? signature.trim().slice(0, 200) : null;

    const gate = (trial) => {
      const scorecard = this.buildScorecard(trial);
      return {
        pass: scorecard.eligibleForPromotion,
        scorecard,
        reasons: scorecard.eligibleForPromotion
          ? []
          : [`Scorecard ${scorecard.totalScore} / 100 is not eligible (threshold ${scorecard.promotionThreshold}, all executed tests must pass).`]
      };
    };

    // 1. Run Karpathy Ratchet Trial (the gate runs before any commit).
    const ratchetResult = await this.ratchet.executeTrial({
      hypothesis: hypothesis || taskTitle,
      testCommand: command,
      metricExtractor,
      baselineScore,
      timeoutMs: timeoutMs || this.config.timeoutMs,
      gate
    });

    let museResult = {};
    let autoSkillResult = {};

    if (ratchetResult.action === TrialAction.COMMITTED && cleanSignature) {
      // 2. Trajectory Reflection: Record in MUSE Memory
      museResult = this.memory.recordExperience({
        domain,
        signature: cleanSignature,
        rootCause,
        winningFix: rule || ratchetResult.hypothesis
      });

      // 3. Lifelong Evolution: Distill into modular Skill.md (or just refresh its utility)
      if (rule) {
        autoSkillResult = this.skills.distillSkill({
          name: cleanSignature,
          description: ratchetResult.hypothesis,
          domain,
          rootCause,
          rule,
          verifiedCode,
          utilityScore: museResult.utilityScore ?? 1.0
        });
      } else {
        autoSkillResult = this.syncSkillUtility(cleanSignature, museResult.utilityScore);
      }
    } else if (REGRESSION_ACTIONS.has(ratchetResult.action) && cleanSignature) {
      // Only a hypothesis that was actually tried and failed is a regression.
      const utility = this.memory.reportRegression(cleanSignature);
      if (utility !== null) {
        museResult = { signature: cleanSignature, action: 'REGRESSION_RECORDED', utilityScore: utility };
        autoSkillResult = this.syncSkillUtility(cleanSignature, utility);
      }
    }

    // Every trial that touched the workspace is persisted as a trajectory.
    if (ratchetResult.action !== TrialAction.NO_CHANGES && ratchetResult.action !== TrialAction.CIRCUIT_OPEN) {
      this.memory.recordTrajectory({
        signature: cleanSignature,
        domain,
        hypothesis: ratchetResult.hypothesis,
        action: ratchetResult.action,
        exitCode: ratchetResult.exitCode,
        score: ratchetResult.score,
        durationMs: ratchetResult.durationMs,
        diff: ratchetResult.diff,
        stdout: ratchetResult.stdout,
        stderr: ratchetResult.stderr
      });
    }

    // 4. Scorecard (already computed by the gate when tests passed).
    const scorecard = ratchetResult.gate?.scorecard || this.buildScorecard(ratchetResult);

    // 5. Generate 8-Section Evidence Report
    const reportText = EvidenceReporter.generateReport({
      taskTitle,
      domain,
      ratchetResult,
      museResult,
      autoSkillResult,
      scorecard
    });

    return {
      success: ratchetResult.success,
      action: ratchetResult.action,
      scorecard,
      ratchet: ratchetResult,
      muse: museResult,
      autoSkill: autoSkillResult,
      report: reportText
    };
  }

  /**
   * Keeps a distilled skill's utility in line with its MUSE experience.
   */
  syncSkillUtility(signature, utilityScore) {
    const synced = this.skills.updateUtility(signature, utilityScore);
    return synced ? { ...synced, action: synced.active ? 'UTILITY_UPDATED' : 'ARCHIVED' } : {};
  }

  /**
   * Records a regression reported by a human (e.g. from the web UI) and syncs the skill.
   */
  recordManualRegression(signature) {
    const utility = this.memory.reportRegression(signature);
    if (utility === null) return null;
    return { signature: MUSEMemory.normalizeSignature(signature), newUtility: utility, skill: this.syncSkillUtility(signature, utility) };
  }

  /**
   * Closes the circuit breaker after a human has reviewed the failures.
   */
  resetCircuitBreaker() {
    return this.ratchet.resetCircuitBreaker();
  }

  /**
   * System health and status overview (exact counts, persisted across restarts).
   */
  getStatus() {
    const skills = this.skills.getAllSkills();

    return {
      engine: `EvoCore Tri-Core Evolution Engine v${VERSION}`,
      activeSkillsCount: skills.filter(s => s.active).length,
      totalSkillsCount: skills.length,
      experiencesCount: this.memory.countExperiences(),
      activeExperiencesCount: this.memory.countExperiences({ activeOnly: true }),
      historyCount: this.memory.countTrajectories(),
      circuitBreakerFailures: this.ratchet.consecutiveFailures,
      maxConsecutiveFailures: this.ratchet.maxConsecutiveFailures,
      circuitOpen: this.ratchet.circuitOpen
    };
  }

  /**
   * Cleans up resources.
   */
  close() {
    this.memory.close();
  }
}
