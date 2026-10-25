/**
 * EVO-CORE ORCHESTRATOR
 * The unified master interface uniting Karpathy Ratchet, MUSE Memory, and AutoSkill Distiller.
 */

import path from 'node:path';
import { Gatekeeper } from './gatekeeper.js';
import { ASTScanner } from './ast_scanner.js';
import { RatchetEngine } from './ratchet_engine.js';
import { MUSEMemory } from './muse_memory.js';
import { AutoSkillDistiller } from './autoskill_distiller.js';
import { EvidenceReporter } from './reporter.js';

export class EvoCore {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.ratchet = new RatchetEngine({ repoDir: this.rootDir });
    this.memory = new MUSEMemory(path.join(this.rootDir, 'storage', 'memory.sqlite'));
    this.skills = new AutoSkillDistiller(path.join(this.rootDir, 'skills'));
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
   * Executes a full closed-loop evolution trial:
   * Ratchet -> MUSE Reflection -> AutoSkill Distillation -> Scorecard -> 8-Section Report
   */
  executeEvolutionStep({
    taskTitle = 'Autonomous Task',
    domain = 'GENERAL',
    hypothesis,
    testCommand,
    metricExtractor = null,
    baselineScore = 0.0,
    signature,
    rootCause = '',
    rule = '',
    verifiedCode = '',
    requirementsMet = 1,
    requirementsTotal = 1,
    testsPassed = 1,
    testsTotal = 1
  }) {
    // 1. Run Karpathy Ratchet Trial (Sandbox Execution & Git Ratchet)
    const ratchetResult = this.ratchet.executeTrial({
      hypothesis,
      testCommand,
      metricExtractor,
      baselineScore
    });

    let museResult = {};
    let autoSkillResult = {};
    let scorecard = {};

    if (ratchetResult.success) {
      // 2. Trajectory Reflection: Record in MUSE Memory
      if (signature) {
        museResult = this.memory.recordExperience({
          domain,
          signature,
          rootCause,
          winningFix: rule || hypothesis
        });

        // 3. Lifelong Evolution: Distill into modular Skill.md
        if (rule) {
          autoSkillResult = this.skills.distillSkill({
            name: signature,
            description: hypothesis,
            domain,
            rootCause,
            rule,
            verifiedCode,
            utilityScore: museResult.utilityScore || 1.0
          });
        }
      }

      // 4. Evaluate 100-Point Scorecard
      scorecard = Gatekeeper.evaluateScorecard({
        requirementsMet,
        requirementsTotal,
        compileOk: ratchetResult.exitCode === 0,
        testsPassed,
        testsTotal,
        zeroSecurityViolations: true,
        modularCode: true,
        withinResourceBudget: true
      });
    } else {
      // Record failed regression if signature exists
      if (signature) {
        this.memory.reportRegression(signature);
      }
      scorecard = {
        totalScore: 0.0,
        eligibleForPromotion: false
      };
    }

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
   * System health and status overview.
   */
  getStatus() {
    const activeSkills = this.skills.getActiveSkills();
    const experiences = this.memory.findRelevantExperiences('', null);

    return {
      engine: 'EvoCore Tri-Core Evolution Engine v1.0.0',
      activeSkillsCount: activeSkills.length,
      experiencesCount: experiences.length,
      historyCount: this.ratchet.executionHistory.length,
      circuitBreakerFailures: this.ratchet.consecutiveFailures
    };
  }

  /**
   * Cleans up resources.
   */
  close() {
    this.memory.close();
  }
}
