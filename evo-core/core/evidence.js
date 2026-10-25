/**
 * EVO-CORE TEST EVIDENCE PARSER
 * Extracts real pass/fail counts from test runner output so the scorecard is
 * computed from evidence, never from numbers claimed by the caller.
 * Supported: node:test (TAP + spec), Jest, Vitest, pytest, Mocha, generic TAP.
 * Unknown output falls back to the exit code as a single check.
 */

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function lastInt(text, regex) {
  let value = null;
  for (const match of text.matchAll(regex)) value = parseInt(match[1], 10);
  return value;
}

function countIn(fragment, label) {
  const match = fragment.match(new RegExp(`(\\d+)\\s+${label}`, 'i'));
  return match ? parseInt(match[1], 10) : 0;
}

function result(framework, { total, passed, failed, skipped = 0 }) {
  return { source: 'parsed', framework, total, passed, failed, skipped, executed: Math.max(total - skipped, 0) };
}

const PARSERS = [
  function nodeTap(text) {
    const total = lastInt(text, /^# tests (\d+)\s*$/gm);
    if (total === null) return null;
    const passed = lastInt(text, /^# pass (\d+)\s*$/gm) ?? 0;
    const failed = (lastInt(text, /^# fail (\d+)\s*$/gm) ?? 0) + (lastInt(text, /^# cancelled (\d+)\s*$/gm) ?? 0);
    const skipped = (lastInt(text, /^# skipped (\d+)\s*$/gm) ?? 0) + (lastInt(text, /^# todo (\d+)\s*$/gm) ?? 0);
    return result('node:test', { total, passed, failed, skipped });
  },

  function nodeSpec(text) {
    const total = lastInt(text, /^ℹ tests (\d+)\s*$/gm);
    if (total === null) return null;
    const passed = lastInt(text, /^ℹ pass (\d+)\s*$/gm) ?? 0;
    const failed = (lastInt(text, /^ℹ fail (\d+)\s*$/gm) ?? 0) + (lastInt(text, /^ℹ cancelled (\d+)\s*$/gm) ?? 0);
    const skipped = (lastInt(text, /^ℹ skipped (\d+)\s*$/gm) ?? 0) + (lastInt(text, /^ℹ todo (\d+)\s*$/gm) ?? 0);
    return result('node:test', { total, passed, failed, skipped });
  },

  function jest(text) {
    const lines = [...text.matchAll(/^Tests:\s+(.*\d+ total)\s*$/gm)];
    if (lines.length === 0) return null;
    const summary = lines[lines.length - 1][1];
    return result('jest', {
      total: countIn(summary, 'total'),
      passed: countIn(summary, 'passed'),
      failed: countIn(summary, 'failed'),
      skipped: countIn(summary, 'skipped') + countIn(summary, 'todo')
    });
  },

  function vitest(text) {
    const lines = [...text.matchAll(/^\s*Tests\s+(.+?)\s+\((\d+)\)\s*$/gm)];
    if (lines.length === 0) return null;
    const [, summary, total] = lines[lines.length - 1];
    return result('vitest', {
      total: parseInt(total, 10),
      passed: countIn(summary, 'passed'),
      failed: countIn(summary, 'failed'),
      skipped: countIn(summary, 'skipped') + countIn(summary, 'todo')
    });
  },

  function pytest(text) {
    const lines = [...text.matchAll(/^=+ (.*?\d+ (?:passed|failed|error|errors|skipped|xfailed|xpassed).*?) in [\d.]+s(?: \([^)]*\))? =+\s*$/gm)];
    if (lines.length === 0) return null;
    const summary = lines[lines.length - 1][1];
    const passed = countIn(summary, 'passed') + countIn(summary, 'xpassed');
    const failed = countIn(summary, 'failed') + countIn(summary, 'errors?');
    const skipped = countIn(summary, 'skipped') + countIn(summary, 'xfailed') + countIn(summary, 'deselected');
    return result('pytest', { total: passed + failed + skipped, passed, failed, skipped });
  },

  function mocha(text) {
    const passing = lastInt(text, /^\s*(\d+) passing\b/gm);
    if (passing === null) return null;
    const failed = lastInt(text, /^\s*(\d+) failing\b/gm) ?? 0;
    const skipped = lastInt(text, /^\s*(\d+) pending\b/gm) ?? 0;
    return result('mocha', { total: passing + failed + skipped, passed: passing, failed, skipped });
  },

  function genericTap(text) {
    const oks = [...text.matchAll(/^(not )?ok \d+\b(.*)$/gm)];
    if (oks.length === 0) return null;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    for (const [, not, rest] of oks) {
      if (/#\s*(skip|todo)\b/i.test(rest)) skipped++;
      else if (not) failed++;
      else passed++;
    }
    return result('tap', { total: oks.length, passed, failed, skipped });
  }
];

export class TestEvidence {
  /**
   * @param {string} output Combined stdout + stderr of the test command
   * @param {number} exitCode Exit code of the test command
   * @returns {{source:'parsed'|'exit-code', framework:string, total:number, passed:number,
   *   failed:number, skipped:number, executed:number}}
   */
  static parse(output = '', exitCode = 0) {
    const text = String(output).replace(ANSI_RE, '').replace(/\r\n/g, '\n');

    for (const parser of PARSERS) {
      const parsed = parser(text);
      if (parsed && parsed.total > 0) return parsed;
    }

    // No recognisable summary: the exit code is the only evidence (one check).
    return {
      source: 'exit-code',
      framework: 'unknown',
      total: 1,
      passed: exitCode === 0 ? 1 : 0,
      failed: exitCode === 0 ? 0 : 1,
      skipped: 0,
      executed: 1
    };
  }
}
