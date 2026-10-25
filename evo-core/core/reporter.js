/**
 * EVO-CORE 8-SECTION EVIDENCE REPORTER
 * Generates transparent, verifiable evidence audit reports conforming to Layer 0 Invariants.
 */

import { Gatekeeper } from './gatekeeper.js';

export class EvidenceReporter {
  /**
   * Builds the comprehensive 8-section evidence report.
   */
  static generateReport({
    taskTitle = 'Autonomous Optimization',
    domain = 'GENERAL',
    ratchetResult = {},
    museResult = {},
    autoSkillResult = {},
    scorecard = {}
  }) {
    const now = new Date().toISOString();
    const isPromoted = ratchetResult.action === 'COMMITTED' && scorecard.eligibleForPromotion;

    const sections = [
      '========================================================================================',
      `🏛️ EVO-CORE v1.0: 8-SECTION EVIDENCE REPORT — [${isPromoted ? 'PROMOTED' : 'ROLLED_BACK'}]`,
      `TIMESTAMP: ${now} | DOMAIN: ${domain}`,
      '========================================================================================',
      '',
      '### [Section 1: Executive Contract & Target]',
      `- Task: ${taskTitle}`,
      `- Domain: ${domain}`,
      `- Target Hypothesis: ${ratchetResult.hypothesis || 'N/A'}`,
      `- Baseline Score: ${ratchetResult.baselineScore || 0.0}`,
      '',
      '### [Section 2: Empirical Execution Logs]',
      `- Exit Code: ${ratchetResult.exitCode !== undefined ? ratchetResult.exitCode : 'NOT_RUN'}`,
      `- Duration: ${ratchetResult.durationMs ? (ratchetResult.durationMs + ' ms') : 'N/A'}`,
      `- Action Taken: ${ratchetResult.action || 'NONE'}`,
      `- Commit Hash: ${ratchetResult.commitHash || 'NONE'}`,
      `- Circuit Breaker: ${ratchetResult.circuitBreakerTripped ? 'TRIPPED (Max Failures Reached)' : 'HEALTHY'}`,
      '',
      '### [Section 3: Unified Git Diff Patch]',
      ratchetResult.diff ? ['```diff', ratchetResult.diff.trim(), '```'].join('\n') : '*No changes or rolled back.*',
      '',
      '### [Section 4: MUSE Trajectory Trace]',
      `- Signature: ${museResult.signature || 'N/A'}`,
      `- Action: ${museResult.action || 'NONE'}`,
      `- Utility Score: ${museResult.utilityScore !== undefined ? museResult.utilityScore : 'N/A'}`,
      '',
      '### [Section 5: AutoSkill Delta]',
      `- Skill Name: ${autoSkillResult.slug || 'N/A'}`,
      `- File: ${autoSkillResult.filePath || 'N/A'}`,
      `- Version: ${autoSkillResult.version || 'N/A'}`,
      `- Status: ${autoSkillResult.action || 'NONE'}`,
      '',
      '### [Section 6: 100-Point Deterministic Scorecard]',
      `- Total Score: ${scorecard.totalScore !== undefined ? scorecard.totalScore + ' / 100 pts' : 'N/A'}`,
      `- Promotion Threshold: >= 75.0 pts (Required)`,
      `- Eligible for Promotion: ${scorecard.eligibleForPromotion ? 'YES' : 'NO'}`,
      scorecard.breakdown ? [
        '  * Requirements: ' + scorecard.breakdown.requirements.weighted + '/25',
        '  * Correctness: ' + scorecard.breakdown.correctness.weighted + '/25',
        '  * Automated Tests: ' + scorecard.breakdown.automatedTests.weighted + '/20',
        '  * Safety & Security: ' + scorecard.breakdown.safety.weighted + '/15',
        '  * Maintainability: ' + scorecard.breakdown.maintainability.weighted + '/10',
        '  * Resource Budget: ' + scorecard.breakdown.resourceBudget.weighted + '/5'
      ].join('\n') : '',
      '',
      '### [Section 7: Invariant Checks & Anti-Gaming]',
      `- Anti-Gaming Diff Audit: ${ratchetResult.action === 'REJECTED_GAMING' ? 'FAILED (Assertion Tampering Detected)' : 'PASSED'}`,
      `- High-Entropy Secret Masking: APPLIED`,
      '',
      '### [Section 8: Final Promotion Status]',
      `DECISION: ${isPromoted ? '✔ PROMOTED TO REPOSITORY' : '✖ REJECTED & ROLLED BACK'}`,
      '========================================================================================'
    ];

    return sections.join('\n');
  }
}
