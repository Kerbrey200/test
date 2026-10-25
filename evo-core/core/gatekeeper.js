/**
 * EVO-CORE GATEKEEPER & SAFETY GUARDIAN
 * Enforces Layer 0 Zero-Hallucination, Shannon Entropy Secret Masking,
 * Anti-Gaming Diff Protection, and 100-Point Deterministic Scoring.
 */

export class Gatekeeper {
  /**
   * Calculates Shannon Entropy of a string to detect high-entropy secrets/keys.
   * H = - \sum (p_i * log2(p_i))
   */
  static calculateEntropy(str = '') {
    if (!str || str.length === 0) return 0;
    const len = str.length;
    const frequencies = new Map();

    for (let i = 0; i < len; i++) {
      const char = str[i];
      frequencies.set(char, (frequencies.get(char) || 0) + 1);
    }

    let entropy = 0;
    for (const count of frequencies.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Masks any high-entropy substring (API keys, private tokens, passwords).
   * Distinguishes between program identifiers (e.g. MQL5_ARRAY_OUT_OF_RANGE) and true random secrets.
   */
  static maskSecrets(text = '') {
    if (typeof text !== 'string') return text;

    // 1. Mask known vendor prefix tokens immediately
    let cleaned = text.replace(/(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{30,})/g, '[REDACTED_SECRET]');

    // 2. High-entropy random hex or base64 (without normal uppercase underscore word patterns)
    cleaned = cleaned.replace(/[A-Za-z0-9_\-\.]{16,}/g, (match) => {
      // Ignore normal programming identifier patterns like ALL_CAPS_IDENTIFIER or camelCaseWords
      if (/^[A-Z0-9_]+$/.test(match) && match.includes('_')) return match;
      if (/^[0-9]+$/.test(match) || /^[a-z]+$/.test(match)) return match;
      
      const entropy = Gatekeeper.calculateEntropy(match);
      // High-entropy random tokens typically exceed H >= 3.6 bits without dictionary structures
      if (entropy >= 3.6 && /[0-9]/.test(match) && /[a-z]/i.test(match)) {
        return '[REDACTED_SECRET]';
      }
      return match;
    });

    return cleaned;
  }

  /**
   * Anti-Gaming Diff Audit:
   * Inspects code diff to ensure the patch does not game tests by removing assertions,
   * skipping test conditions, or spoofing mock outputs.
   */
  static auditDiffForGaming(diffText = '') {
    const findings = [];

    // 1. Detection of assertion deletion or skipping
    const removedAssertionRegex = /^\-\s*(assert|expect|should|throw new|test\.skip|it\.skip)/m;
    if (removedAssertionRegex.test(diffText)) {
      findings.push({
        type: 'ASSERTION_WEAKENING',
        severity: 'CRITICAL',
        message: 'Patch deletes assertions or skips test conditions to fake pass.'
      });
    }

    // 2. Detection of hardcoded fake test return
    const fakeTestReturnRegex = /^\+\s*return\s+(true|0|{\s*status:\s*['"]pass['"]\s*});?\s*$/m;
    if (fakeTestReturnRegex.test(diffText) && /test/i.test(diffText)) {
      findings.push({
        type: 'TEST_SPOOFING',
        severity: 'CRITICAL',
        message: 'Patch injects hardcoded unconditional truthy return into test flow.'
      });
    }

    return {
      clean: findings.length === 0,
      findings
    };
  }

  /**
   * Calculates the Utility Score for a learned lesson or skill:
   * U = (h - 2z) / n
   * h: hits (successful reuses)
   * z: regressions (caused errors/failures)
   * n: total invocations
   */
  static calculateUtilityScore(hits = 0, regressions = 0, totalUses = 1) {
    if (totalUses <= 0) return 0;
    const score = (hits - (2 * regressions)) / totalUses;
    return Math.max(-1.0, Math.min(1.0, parseFloat(score.toFixed(4))));
  }

  /**
   * 100-Point Deterministic Scorecard:
   * Total Score = \sum (S_k / 5.0) * W_k (0 to 100 points)
   */
  static evaluateScorecard({
    requirementsMet = 1,
    requirementsTotal = 1,
    compileOk = true,
    testsPassed = 0,
    testsTotal = 0,
    zeroSecurityViolations = true,
    modularCode = true,
    withinResourceBudget = true
  }) {
    // 1. Requirements (25 pts)
    const reqRatio = requirementsTotal > 0 ? (requirementsMet / requirementsTotal) : 0;
    const sRequirements = 5.0 * reqRatio;
    const wRequirements = (sRequirements / 5.0) * 25;

    // 2. Correctness (25 pts)
    const sCorrectness = compileOk ? (testsTotal > 0 ? 5.0 * (testsPassed / testsTotal) : 3.0) : 0.0;
    const wCorrectness = (sCorrectness / 5.0) * 25;

    // 3. Automated Tests (20 pts)
    const sTests = testsTotal > 0 ? 5.0 * (testsPassed / testsTotal) : 0.0;
    const wTests = (sTests / 5.0) * 20;

    // 4. Safety & Security (15 pts)
    const sSafety = zeroSecurityViolations ? 5.0 : 0.0;
    const wSafety = (sSafety / 5.0) * 15;

    // 5. Maintainability (10 pts)
    const sModularity = modularCode ? 5.0 : 2.5;
    const wModularity = (sModularity / 5.0) * 10;

    // 6. Cost & Latency (5 pts)
    const sResource = withinResourceBudget ? 5.0 : 2.0;
    const wResource = (sResource / 5.0) * 5;

    const totalScore = parseFloat(
      (wRequirements + wCorrectness + wTests + wSafety + wModularity + wResource).toFixed(2)
    );

    const eligibleForPromotion = 
      totalScore >= 75.0 && 
      compileOk && 
      testsPassed === testsTotal && 
      testsTotal > 0 && 
      zeroSecurityViolations;

    return {
      totalScore,
      eligibleForPromotion,
      breakdown: {
        requirements: { score: sRequirements, weighted: wRequirements, max: 25 },
        correctness: { score: sCorrectness, weighted: wCorrectness, max: 25 },
        automatedTests: { score: sTests, weighted: wTests, max: 20 },
        safety: { score: sSafety, weighted: wSafety, max: 15 },
        maintainability: { score: sModularity, weighted: wModularity, max: 10 },
        resourceBudget: { score: sResource, weighted: wResource, max: 5 }
      }
    };
  }
}
