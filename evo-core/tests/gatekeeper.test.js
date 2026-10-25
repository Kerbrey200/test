import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Gatekeeper } from '../core/gatekeeper.js';

describe('EvoCore Layer 0: Gatekeeper & Safety Invariants', () => {

  it('accurately computes Shannon Entropy for low and high entropy strings', () => {
    const low = Gatekeeper.calculateEntropy('hello');
    const high = Gatekeeper.calculateEntropy('a9f4c3b2e1d0587a89b4c6e1');
    assert.ok(high > low);
    assert.ok(high >= 3.4);
  });

  it('masks high-entropy secret tokens with [REDACTED_SECRET]', () => {
    const secret = 'sk-proj-984bf40a1d94827c19a84b029';
    const text = `Connecting with API key: ${secret} to server.`;
    const masked = Gatekeeper.maskSecrets(text);
    assert.ok(!masked.includes(secret));
    assert.ok(masked.includes('[REDACTED_SECRET]'));
  });

  it('detects assertion weakening gaming attempts in diff', () => {
    const gamingDiff = `
--- a/test.js
+++ b/test.js
@@ -10,3 +10,2 @@
-  assert.strictEqual(calc(), 100);
    return true;
`;
    const audit = Gatekeeper.auditDiffForGaming(gamingDiff);
    assert.strictEqual(audit.clean, false);
    assert.strictEqual(audit.findings[0].type, 'ASSERTION_WEAKENING');
  });

  it('detects fake test pass spoofing in diff', () => {
    const spoofDiff = `
--- a/test.js
+++ b/test.js
@@ -5,2 +5,3 @@
+  return true;
`;
    const audit = Gatekeeper.auditDiffForGaming(spoofDiff);
    assert.strictEqual(audit.clean, false);
    assert.strictEqual(audit.findings[0].type, 'TEST_SPOOFING');
  });

  it('calculates Utility Score correctly using U = (h - 2z) / n', () => {
    // 5 hits, 0 regressions, 5 uses = 1.0
    assert.strictEqual(Gatekeeper.calculateUtilityScore(5, 0, 5), 1.0);
    // 4 hits, 1 regression, 5 uses = (4 - 2) / 5 = 0.4
    assert.strictEqual(Gatekeeper.calculateUtilityScore(4, 1, 5), 0.4);
    // 1 hit, 2 regressions, 3 uses = (1 - 4) / 3 = -1.0
    assert.strictEqual(Gatekeeper.calculateUtilityScore(1, 2, 3), -1.0);
  });

  it('evaluates 100-Point Scorecard with mathematical consistency', () => {
    const passing = Gatekeeper.evaluateScorecard({
      requirementsMet: 1,
      requirementsTotal: 1,
      compileOk: true,
      testsPassed: 10,
      testsTotal: 10,
      zeroSecurityViolations: true,
      modularCode: true,
      withinResourceBudget: true
    });

    assert.strictEqual(passing.totalScore, 100);
    assert.strictEqual(passing.eligibleForPromotion, true);

    const failing = Gatekeeper.evaluateScorecard({
      requirementsMet: 1,
      requirementsTotal: 2,
      compileOk: false,
      testsPassed: 0,
      testsTotal: 10,
      zeroSecurityViolations: true,
      modularCode: false,
      withinResourceBudget: false
    });

    assert.ok(failing.totalScore < 50);
    assert.strictEqual(failing.eligibleForPromotion, false);
  });

});
