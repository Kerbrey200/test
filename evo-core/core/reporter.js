/**
 * EVO-CORE 8-SECTION EVIDENCE REPORTER
 * Generates transparent, verifiable evidence audit reports conforming to Layer 0 Invariants.
 * The decision line is derived from what actually happened in git, never from intent.
 */

import { Gatekeeper } from './gatekeeper.js';
import { VERSION } from './version.js';

const MAX_DIFF_LINES = 400;

const DECISIONS = {
  COMMITTED: { banner: 'PROMOTED', text: '✔ PROMOTED TO REPOSITORY' },
  ROLLED_BACK: { banner: 'ROLLED_BACK', text: '✖ REJECTED & ROLLED BACK (tests, evidence or metric failed)' },
  REJECTED_GATE: { banner: 'ROLLED_BACK', text: '✖ REJECTED BY PROMOTION GATE & ROLLED BACK' },
  REJECTED_GAMING: { banner: 'ROLLED_BACK', text: '✖ REJECTED: ANTI-GAMING AUDIT FAILED & ROLLED BACK' },
  REJECTED_SECURITY: { banner: 'ROLLED_BACK', text: '✖ REJECTED: CREDENTIAL IN DIFF & ROLLED BACK' },
  COMMIT_FAILED: { banner: 'ROLLED_BACK', text: '✖ COMMIT FAILED (git/hook error) & ROLLED BACK' },
  ROLLBACK_FAILED: { banner: 'ATTENTION', text: '⚠ REJECTED BUT ROLLBACK FAILED — working tree needs manual review' },
  NO_CHANGES: { banner: 'NO_CHANGES', text: '• NOTHING TO EVALUATE (no in-scope changes)' },
  CIRCUIT_OPEN: { banner: 'BLOCKED', text: '⛔ CIRCUIT BREAKER OPEN — trial was not executed' }
};

function truncateDiff(diff) {
  const lines = Gatekeeper.maskSecrets(diff.trim()).split('\n');
  if (lines.length <= MAX_DIFF_LINES) return lines.join('\n');
  return [...lines.slice(0, MAX_DIFF_LINES), `... (${lines.length - MAX_DIFF_LINES} more lines truncated)`].join('\n');
}

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
    const decision = DECISIONS[ratchetResult.action] || { banner: 'UNKNOWN', text: '? UNKNOWN OUTCOME' };
    const evidence = ratchetResult.evidence;
    const findings = ratchetResult.findings || [];
    const gateReasons = ratchetResult.gate?.reasons || [];

    const sections = [
      '========================================================================================',
      `🏛️ EVO-CORE v${VERSION}: 8-SECTION EVIDENCE REPORT — [${decision.banner}]`,
      `TIMESTAMP: ${now} | DOMAIN: ${domain}`,
      '========================================================================================',
      '',
      '### [Section 1: Executive Contract & Target]',
      `- Task: ${Gatekeeper.maskSecrets(String(taskTitle))}`,
      `- Domain: ${domain}`,
      `- Target Hypothesis: ${ratchetResult.hypothesis || 'N/A'}`,
      `- Baseline Score: ${ratchetResult.baselineScore ?? 0.0}`,
      `- Achieved Score: ${ratchetResult.score ?? 'N/A'}`,
      '',
      '### [Section 2: Empirical Execution Logs]',
      `- Test Command: ${ratchetResult.testCommand || 'N/A'}`,
      `- Exit Code: ${ratchetResult.exitCode !== undefined ? ratchetResult.exitCode : 'NOT_RUN'}`,
      `- Duration: ${ratchetResult.durationMs !== undefined ? `${ratchetResult.durationMs} ms` : 'N/A'}${ratchetResult.timedOut ? ' (TIMED OUT)' : ''}`,
      `- Test Evidence: ${evidence ? `${evidence.passed}/${evidence.executed} passed, ${evidence.failed} failed, ${evidence.skipped} skipped [${evidence.framework}, ${evidence.source}]` : 'N/A'}`,
      ratchetResult.metricError ? `- Metric Error: ${ratchetResult.metricError}` : '',
      `- Action Taken: ${ratchetResult.action || 'NONE'}`,
      `- Commit Hash: ${ratchetResult.commitHash || 'NONE'}`,
      `- Circuit Breaker: ${ratchetResult.circuitBreakerTripped ? 'TRIPPED (Max Failures Reached)' : 'HEALTHY'} (${ratchetResult.consecutiveFailures ?? 0} consecutive failures)`,
      '',
      '### [Section 3: Unified Git Diff Patch]',
      ratchetResult.diffStats ? `- Changed: ${ratchetResult.files?.length || 0} file(s), +${ratchetResult.diffStats.added} / -${ratchetResult.diffStats.removed} lines` : '',
      ratchetResult.diff && ratchetResult.diff.trim() ? ['```diff', truncateDiff(ratchetResult.diff), '```'].join('\n') : '*No changes.*',
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
      `- Total Score: ${scorecard.totalScore !== undefined ? `${scorecard.totalScore} / 100 pts` : 'N/A'}`,
      `- Promotion Threshold: >= ${scorecard.promotionThreshold ?? 75.0} pts (Required)`,
      `- Eligible for Promotion: ${scorecard.eligibleForPromotion ? 'YES' : 'NO'}`,
      scorecard.breakdown ? [
        `  * Requirements: ${scorecard.breakdown.requirements.weighted}/25`,
        `  * Correctness: ${scorecard.breakdown.correctness.weighted}/25`,
        `  * Automated Tests: ${scorecard.breakdown.automatedTests.weighted}/20`,
        `  * Safety & Security: ${scorecard.breakdown.safety.weighted}/15`,
        `  * Maintainability: ${scorecard.breakdown.maintainability.weighted}/10`,
        `  * Resource Budget: ${scorecard.breakdown.resourceBudget.weighted}/5`
      ].join('\n') : '',
      ...gateReasons.map(reason => `- Gate: ${reason}`),
      '',
      '### [Section 7: Invariant Checks & Anti-Gaming]',
      `- Anti-Gaming Diff Audit: ${ratchetResult.action === 'REJECTED_GAMING' || ratchetResult.rejectedAs === 'REJECTED_GAMING' ? 'FAILED' : (ratchetResult.diffStats ? 'PASSED' : 'NOT_RUN')}`,
      `- Credential Scan: ${findings.some(f => f.type === 'SECRET_IN_DIFF') ? 'FAILED' : (ratchetResult.diffStats ? 'PASSED' : 'NOT_RUN')}`,
      ...findings.map(f => `  * [${f.severity}] ${f.type}${f.file ? ` (${f.file})` : ''}: ${f.message}`),
      `- High-Entropy Secret Masking: APPLIED`,
      '',
      '### [Section 8: Final Promotion Status]',
      `DECISION: ${decision.text}`,
      ratchetResult.rollback?.stashRef ? `Recover rolled-back work with: git stash apply ${ratchetResult.rollback.stashRef}` : '',
      ratchetResult.rollback?.error ? `Rollback error: ${ratchetResult.rollback.error}` : '',
      ratchetResult.message ? `Note: ${ratchetResult.message}` : '',
      '========================================================================================'
    ];

    return sections.filter(line => line !== '').join('\n').replace(/\n(### )/g, '\n\n$1');
  }
}
