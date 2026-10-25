/**
 * EVO-CORE GATEKEEPER & SAFETY GUARDIAN
 * Enforces Layer 0 Zero-Hallucination, secret masking, anti-gaming diff
 * protection and the 100-point deterministic scorecard.
 */

export const REDACTED = '[REDACTED_SECRET]';

// Lessons and skills below this utility are archived (kept, but not injected).
export const ACTIVE_UTILITY_THRESHOLD = 0.5;

// High-confidence vendor token formats. These are always secrets.
const VENDOR_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{35}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
];

// The secret word must END the key name: apiKey, GITHUB_TOKEN, db_password match,
// tokenizer or passwordHint do not.
const SECRET_KEY_WORDS = '(?:api[_-]?key|secret(?:[_-]?key)?|token|passw(?:or)?d|pwd|auth[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)';

// Key prefixes are length-bounded so long dotted input (minified code) stays linear.
// key = "value" / key: 'value' (quoted literal assigned to a secret-looking name)
const QUOTED_ASSIGNMENT = new RegExp(
  `(\\b[A-Za-z0-9_.-]{0,40}?${SECRET_KEY_WORDS}["']?\\s*[:=]\\s*)(["'\`])([^"'\`\\s]{8,})\\2`,
  'gi'
);
// .env style: API_KEY=value (whole line)
const ENV_ASSIGNMENT = new RegExp(
  `^(\\s*(?:export\\s+)?[A-Za-z0-9_]{0,40}?${SECRET_KEY_WORDS}\\s*=\\s*)([^\\s"'$][^\\s]{7,})\\s*$`,
  'gim'
);
// Obvious placeholders in fixtures and docs are not credentials.
const PLACEHOLDER_RE = /example|dummy|test|fake|sample|changeme|placeholder|redacted|x{4,}|\*{3,}|your[_-]|^<|\$\{|\{\{/i;
const AUTH_HEADER = /(\bAuthorization\s*:\s*(?:Bearer|Basic|Token)\s+)([A-Za-z0-9._~+/=-]{8,})/gi;
const URL_CREDENTIALS = /(:\/\/[^\s:@/]+:)([^\s@/]{3,})(@)/g;

const TEST_FILE_RE = /(^|[\\/_.-])(tests?|specs?|__tests__)([\\/_.-]|$)/i;
const ASSERTION_RE = /\b(?:assert(?:\.\w+)?|expect|should(?:\.\w+)*|self\.assert\w*|t\.(?:is|not|ok|notOk|true|false|equal|notEqual|deepEqual|throws|notThrows|like|regex))\s*\(|^\s*assert\s+(?!\()/g;
const SKIP_RE = /\b(?:it|test|describe|suite|context)\.(?:skip|todo|only)\s*\(|\b(?:xit|xdescribe|xtest|xcontext|fit|fdescribe)\s*\(|\{\s*(?:skip|todo|only)\s*:\s*true|@pytest\.mark\.(?:skip|skipif|xfail)|@unittest\.skip|\bt\.skip\s*\(|\bpytest\.skip\s*\(/;
const TRIVIAL_ASSERT_RE = /\bassert(?:\.ok)?\s*\(\s*(?:true|1|!0)\s*\)|\bexpect\s*\(\s*(?:true|1)\s*\)\s*\.\s*toBe(?:Truthy)?\s*\(\s*(?:true|1)?\s*\)|\bassert\.(?:strict)?(?:[Ee]qual|deepStrictEqual)\s*\(\s*(true|1|'[^']*'|"[^"]*")\s*,\s*\1\s*\)|^\s*assert\s+True\b|\bself\.assertTrue\s*\(\s*True\s*\)/;
const FAKE_RETURN_RE = /^\s*return\s*\(?\s*(?:true|0|\{\s*status\s*:\s*['"]pass(?:ed)?['"]\s*\})\s*\)?\s*;?\s*$/;
const FORCED_EXIT_RE = /\bprocess\.exit\s*\(\s*0?\s*\)|\bsys\.exit\s*\(\s*0?\s*\)/;
const LOCKFILE_RE = /(^|[\\/])(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/;

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
   * Decides whether a bare token looks like a random secret rather than a
   * program identifier or a path. Identifiers split into readable words
   * (calculateMovingAverage20 -> calculate|Moving|Average|20); random tokens
   * fall apart into 1-2 character fragments at case and digit boundaries.
   */
  static isLikelyRandomToken(token = '') {
    const core = token.replace(/=+$/, '');
    if (core.length < 20) return false;
    if (!/[0-9]/.test(core) || !/[A-Za-z]/.test(core)) return false;

    const parts = core
      .split(/[_\-./+]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])/)
      .filter(Boolean);
    const alnum = core.replace(/[^A-Za-z0-9]/g, '').length;
    const averagePart = alnum / Math.max(parts.length, 1);

    return averagePart < 2.5 && Gatekeeper.calculateEntropy(core) >= 3.0;
  }

  /**
   * Applies the high-confidence detectors only (vendor formats and secret-named
   * assignments). Safe to use as a gate: no false positives on hashes or code.
   */
  static maskKnownSecrets(text = '') {
    if (typeof text !== 'string') return text;
    let cleaned = text;
    for (const pattern of VENDOR_PATTERNS) {
      cleaned = cleaned.replace(pattern, REDACTED);
    }
    const keep = (value) => value.includes(REDACTED) || PLACEHOLDER_RE.test(value);
    cleaned = cleaned
      .replace(QUOTED_ASSIGNMENT, (m, prefix, quote, value) => (keep(value) ? m : `${prefix}${quote}${REDACTED}${quote}`))
      .replace(ENV_ASSIGNMENT, (m, prefix, value) => (keep(value) ? m : `${prefix}${REDACTED}`))
      .replace(AUTH_HEADER, (m, prefix) => `${prefix}${REDACTED}`)
      .replace(URL_CREDENTIALS, (m, prefix, secret, at) => `${prefix}${REDACTED}${at}`);
    return cleaned;
  }

  /**
   * Masks secrets in free text (logs, prompts, commit messages, reports):
   * high-confidence detectors plus random-looking high-entropy tokens.
   * Program identifiers such as MQL5_ARRAY_OUT_OF_RANGE or calculateMovingAverage20
   * are left intact so masked code remains valid code.
   */
  static maskSecrets(text = '') {
    if (typeof text !== 'string') return text;
    const cleaned = Gatekeeper.maskKnownSecrets(text);
    return cleaned.replace(/[A-Za-z0-9+/_\-.=]{20,}/g, (token) =>
      Gatekeeper.isLikelyRandomToken(token) ? REDACTED : token
    );
  }

  /**
   * Splits a unified diff into per-file sections.
   * Diffs without "diff --git" headers are treated as a single section whose
   * path is taken from the "+++ b/<path>" line when present.
   */
  static parseDiff(diffText = '') {
    const files = [];
    let current = null;

    const startFile = (pathName) => {
      current = { path: pathName, deleted: false, renamedFrom: null, added: [], removed: [] };
      files.push(current);
    };

    for (const line of String(diffText).split('\n')) {
      const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (header) {
        startFile(header[2]);
        continue;
      }
      if (!current) startFile(null);

      if (line.startsWith('deleted file mode')) current.deleted = true;
      else if (line.startsWith('rename from ')) current.renamedFrom = line.slice('rename from '.length);
      else if (line.startsWith('+++ ')) {
        const target = line.slice(4).replace(/^b\//, '');
        if (!current.path && target !== '/dev/null') current.path = target;
      } else if (line.startsWith('--- ')) {
        const source = line.slice(4).replace(/^a\//, '');
        if (!current.path && source !== '/dev/null') current.path = source;
      } else if (line.startsWith('+')) current.added.push(line.slice(1));
      else if (line.startsWith('-')) current.removed.push(line.slice(1));
    }

    return files;
  }

  static isTestFile(filePath) {
    return typeof filePath === 'string' && TEST_FILE_RE.test(filePath);
  }

  static countAssertions(lines) {
    let count = 0;
    for (const line of lines) {
      const matches = line.match(ASSERTION_RE);
      if (matches) count += matches.length;
    }
    return count;
  }

  /**
   * Anti-Gaming Diff Audit:
   * Inspects code diff to ensure the patch does not game tests by removing
   * assertions, skipping tests, asserting tautologies, deleting test files,
   * forcing a passing exit, or tampering with the test command.
   * Rewritten assertions (one removed, one added) are not flagged.
   */
  static auditDiffForGaming(diffText = '') {
    const findings = [];
    const add = (type, message, file) => findings.push({ type, severity: 'CRITICAL', message, file: file || null });

    for (const file of Gatekeeper.parseDiff(diffText)) {
      // An unnamed section comes from a bare snippet: audit it as a test file.
      const isTest = file.path === null || Gatekeeper.isTestFile(file.path);
      const wasTest = file.renamedFrom !== null && Gatekeeper.isTestFile(file.renamedFrom);

      if (isTest) {
        const removedAsserts = Gatekeeper.countAssertions(file.removed);
        const addedAsserts = Gatekeeper.countAssertions(file.added);
        if (removedAsserts > addedAsserts) {
          add('ASSERTION_WEAKENING',
            `Patch removes ${removedAsserts - addedAsserts} assertion(s) without replacement.`, file.path);
        }
      }

      if ((isTest && file.deleted) || (wasTest && !isTest)) {
        add('TEST_FILE_DELETED', 'Patch deletes or renames away a test file.', file.renamedFrom || file.path);
      }

      if (file.added.some(line => SKIP_RE.test(line))) {
        add('TEST_SKIPPING', 'Patch skips, focuses or marks tests as todo.', file.path);
      }

      if (file.added.some(line => TRIVIAL_ASSERT_RE.test(line))) {
        add('TRIVIAL_ASSERTION', 'Patch adds a tautological assertion that can never fail.', file.path);
      }

      if (isTest && file.added.some(line => FAKE_RETURN_RE.test(line) || FORCED_EXIT_RE.test(line))) {
        add('TEST_SPOOFING', 'Patch injects an unconditional pass (hardcoded return or forced exit) into test flow.', file.path);
      }

      if (file.path && /(^|[\\/])package\.json$/.test(file.path) &&
          [...file.added, ...file.removed].some(line => /"test(?::[\w-]+)?"\s*:/.test(line))) {
        add('TEST_COMMAND_TAMPERING', 'Patch modifies the npm test script.', file.path);
      }

      if (file.added.some(line => /--passWithNoTests|--pass-with-no-tests/.test(line))) {
        add('TEST_COMMAND_TAMPERING', 'Patch allows the test runner to pass without running tests.', file.path);
      }
    }

    return {
      clean: findings.length === 0,
      findings
    };
  }

  /**
   * Security gate: reports secrets introduced by added diff lines.
   * Uses only high-confidence detectors so hashes in lockfiles or fixtures
   * cannot block a legitimate trial.
   */
  static scanDiffForSecrets(diffText = '') {
    const findings = [];
    for (const file of Gatekeeper.parseDiff(diffText)) {
      if (file.path && LOCKFILE_RE.test(file.path)) continue;
      file.added.forEach((line, index) => {
        if (Gatekeeper.maskKnownSecrets(line) !== line) {
          findings.push({
            type: 'SECRET_IN_DIFF',
            severity: 'CRITICAL',
            message: `Added line ${index + 1} contains a credential.`,
            file: file.path
          });
        }
      });
    }
    return findings;
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
    withinResourceBudget = true,
    promotionThreshold = 75.0
  }) {
    const passed = Math.max(0, Math.min(testsPassed, testsTotal));

    // 1. Requirements (25 pts)
    const reqRatio = requirementsTotal > 0 ? Math.min(requirementsMet / requirementsTotal, 1) : 0;
    const sRequirements = 5.0 * reqRatio;
    const wRequirements = (sRequirements / 5.0) * 25;

    // 2. Correctness (25 pts)
    const sCorrectness = compileOk ? (testsTotal > 0 ? 5.0 * (passed / testsTotal) : 3.0) : 0.0;
    const wCorrectness = (sCorrectness / 5.0) * 25;

    // 3. Automated Tests (20 pts)
    const sTests = testsTotal > 0 ? 5.0 * (passed / testsTotal) : 0.0;
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
      totalScore >= promotionThreshold &&
      compileOk &&
      passed === testsTotal &&
      testsTotal > 0 &&
      zeroSecurityViolations;

    return {
      totalScore,
      eligibleForPromotion,
      promotionThreshold,
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
