import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Gatekeeper, REDACTED } from '../core/gatekeeper.js';

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

  it('never masks program identifiers, paths or ordinary code (regression: Y1)', () => {
    const samples = [
      'double calculateMovingAverage20 = 0;',
      'const mql5_array_out_of_range = 1;',
      'import x from "./components/UserProfile2Card.js";',
      'ArraySetAsSeries(rates_buffer_2024, true);',
      'MQL5_ARRAY_OUT_OF_RANGE',
      'function getUserById2FA_handler() {}',
      'calculateExponentialMovingAverageFor200Periods(close);',
      'const tokenizer = "wordpiece-basic-v2";',
      'GET https://example.com/api/v1/users/12345/profile'
    ];
    for (const sample of samples) {
      assert.equal(Gatekeeper.maskSecrets(sample), sample, `identifier was masked: ${sample}`);
    }
  });

  it('masks vendor tokens, credential assignments, auth headers, URL passwords and random tokens', () => {
    const cases = [
      ['key sk-ant-api03-AbCdEf1234567890XyZ_abcdef', 'sk-ant-api03-AbCdEf1234567890XyZ_abcdef'],
      ['GH ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
      ['aws AKIAIOSFODNN7EXAMPLE here', 'AKIAIOSFODNN7EXAMPLE'],
      ['const apiKey = "Zx8kQ2pLm9TvR4wB";', 'Zx8kQ2pLm9TvR4wB'],
      ['DB_PASSWORD=hunter2hunter2', 'hunter2hunter2'],
      ['Authorization: Bearer abcdef1234567890', 'abcdef1234567890'],
      ['postgres://admin:s3cr3tP4ss@db.local/app', 's3cr3tP4ss'],
      ['token 3f2a9c1b8d7e6f5a4b3c2d1e0f9a8b7c', '3f2a9c1b8d7e6f5a4b3c2d1e0f9a8b7c'],
      ['-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----', 'MIIEow']
    ];
    for (const [text, secret] of cases) {
      const masked = Gatekeeper.maskSecrets(text);
      assert.ok(!masked.includes(secret), `secret leaked: ${masked}`);
      assert.ok(masked.includes(REDACTED), `not redacted: ${masked}`);
    }
  });

  it('masks long minified input in linear time (no catastrophic backtracking)', () => {
    const minified = 'a.'.repeat(100000);
    const started = Date.now();
    Gatekeeper.maskSecrets(minified);
    Gatekeeper.scanDiffForSecrets(`+${minified}`);
    assert.ok(Date.now() - started < 2000, `masking took ${Date.now() - started} ms`);
  });

  it('keeps placeholder credentials used in fixtures and docs', () => {
    for (const text of ['password: "test-password-123"', 'API_KEY=your_api_key_here', 'token = "${TOKEN_FROM_ENV}"']) {
      assert.equal(Gatekeeper.maskKnownSecrets(text), text);
    }
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

  it('accepts rewritten assertions and ordinary source returns (regression: Y8 false positives)', () => {
    const refactor = [
      'diff --git a/tests/calc.test.js b/tests/calc.test.js',
      '--- a/tests/calc.test.js',
      '+++ b/tests/calc.test.js',
      '-  assert.equal(add(1, 2), 3);',
      '+  assert.strictEqual(add(1, 2), 3);'
    ].join('\n');
    assert.equal(Gatekeeper.auditDiffForGaming(refactor).clean, true);

    const sourceReturn = [
      'diff --git a/src/latest.c b/src/latest.c',
      '--- a/src/latest.c',
      '+++ b/src/latest.c',
      '+  return 0;',
      '+// see contest rules in test notes'
    ].join('\n');
    assert.equal(Gatekeeper.auditDiffForGaming(sourceReturn).clean, true);
  });

  it('detects tautological assertions, skipped tests, deleted tests and test script tampering', () => {
    const cases = {
      TRIVIAL_ASSERTION: 'diff --git a/tests/a.test.js b/tests/a.test.js\n-  assert.strictEqual(calc(), 100);\n+  assert.ok(true);',
      TEST_SKIPPING: 'diff --git a/tests/a.test.js b/tests/a.test.js\n+  it.skip(\'slow case\', () => {});',
      TEST_FILE_DELETED: 'diff --git a/tests/a.test.js b/tests/a.test.js\ndeleted file mode 100644\n--- a/tests/a.test.js\n+++ /dev/null\n-describe("x", () => {});',
      TEST_COMMAND_TAMPERING: 'diff --git a/package.json b/package.json\n-    "test": "node --test",\n+    "test": "exit 0",'
    };
    for (const [type, diff] of Object.entries(cases)) {
      const audit = Gatekeeper.auditDiffForGaming(diff);
      assert.equal(audit.clean, false, type);
      assert.ok(audit.findings.some(f => f.type === type), `${type} not detected: ${JSON.stringify(audit.findings)}`);
    }
  });

  it('detects removed Python assert statements', () => {
    const diff = 'diff --git a/test_calc.py b/test_calc.py\n-    assert calc() == 100\n+    pass';
    assert.ok(Gatekeeper.auditDiffForGaming(diff).findings.some(f => f.type === 'ASSERTION_WEAKENING'));
  });

  it('reports credentials added in a diff but ignores lockfile integrity hashes', () => {
    const withSecret = 'diff --git a/src/client.js b/src/client.js\n+const githubToken = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";';
    const findings = Gatekeeper.scanDiffForSecrets(withSecret);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].type, 'SECRET_IN_DIFF');
    assert.equal(findings[0].file, 'src/client.js');

    const lockfile = 'diff --git a/package-lock.json b/package-lock.json\n+      "integrity": "sha512-Zx8kQ2pLm9TvR4wB7yNcQ2pLm9TvR4wB7yNcQ2pLm9TvR4wB7yNc=="';
    assert.deepEqual(Gatekeeper.scanDiffForSecrets(lockfile), []);
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

  it('clamps inflated passed counts and honours a custom promotion threshold', () => {
    const inflated = Gatekeeper.evaluateScorecard({ testsPassed: 50, testsTotal: 10 });
    assert.equal(inflated.breakdown.automatedTests.weighted, 20);

    const strict = Gatekeeper.evaluateScorecard({ testsPassed: 10, testsTotal: 10, modularCode: false, promotionThreshold: 100 });
    assert.equal(strict.totalScore, 95);
    assert.equal(strict.eligibleForPromotion, false);
  });

});
