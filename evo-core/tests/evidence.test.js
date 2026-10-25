import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestEvidence } from '../core/evidence.js';

describe('EvoCore Test Evidence Parser (no claimed numbers)', () => {

  it('parses node:test TAP summaries, counting cancelled as failed and todo as skipped', () => {
    const output = 'ok 1 - a\nnot ok 2 - b\n1..2\n# tests 6\n# suites 1\n# pass 3\n# fail 1\n# cancelled 1\n# skipped 0\n# todo 1\n';
    const ev = TestEvidence.parse(output, 1);
    assert.deepEqual(
      { framework: ev.framework, total: ev.total, passed: ev.passed, failed: ev.failed, skipped: ev.skipped, executed: ev.executed },
      { framework: 'node:test', total: 6, passed: 3, failed: 2, skipped: 1, executed: 5 }
    );
  });

  it('parses node:test spec reporter output even with ANSI colours', () => {
    const output = '\x1b[32m✔ adds\x1b[39m\nℹ tests 4\nℹ suites 1\nℹ pass 4\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';
    const ev = TestEvidence.parse(output, 0);
    assert.equal(ev.passed, 4);
    assert.equal(ev.failed, 0);
    assert.equal(ev.source, 'parsed');
  });

  it('parses Jest, Vitest, pytest and Mocha summaries', () => {
    const jest = TestEvidence.parse('Tests:       1 failed, 1 skipped, 5 passed, 7 total\nTime: 1s', 1);
    assert.deepEqual([jest.framework, jest.passed, jest.failed, jest.skipped, jest.total], ['jest', 5, 1, 1, 7]);

    const vitest = TestEvidence.parse(' Test Files  1 passed (1)\n      Tests  3 passed | 1 failed (4)\n', 1);
    assert.deepEqual([vitest.framework, vitest.passed, vitest.failed, vitest.total], ['vitest', 3, 1, 4]);

    const pytest = TestEvidence.parse('==== 5 passed, 1 failed, 2 skipped, 1 error in 0.42s ====\n', 1);
    assert.deepEqual([pytest.framework, pytest.passed, pytest.failed, pytest.skipped], ['pytest', 5, 2, 2]);

    const mocha = TestEvidence.parse('\n  12 passing (30ms)\n  2 pending\n  1 failing\n', 1);
    assert.deepEqual([mocha.framework, mocha.passed, mocha.failed, mocha.skipped, mocha.total], ['mocha', 12, 1, 2, 15]);
  });

  it('parses generic TAP lines with SKIP/TODO directives', () => {
    const ev = TestEvidence.parse('TAP version 13\nok 1 first\nnot ok 2 second\nok 3 third # SKIP no db\n1..3\n', 1);
    assert.deepEqual([ev.framework, ev.passed, ev.failed, ev.skipped], ['tap', 1, 1, 1]);
  });

  it('falls back to the exit code as a single check when output is not recognised', () => {
    assert.deepEqual(
      TestEvidence.parse('all good', 0),
      { source: 'exit-code', framework: 'unknown', total: 1, passed: 1, failed: 0, skipped: 0, executed: 1 }
    );
    assert.equal(TestEvidence.parse('boom', 2).failed, 1);
  });

});
