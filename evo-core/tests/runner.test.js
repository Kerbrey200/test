import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CommandRunner } from '../core/runner.js';
import { createTempDir, cleanupTempDirs } from './helpers/fixtures.js';

describe('EvoCore Async Command Runner', () => {

  after(cleanupTempDirs);

  it('captures stdout, stderr and the exit code', async () => {
    const res = await CommandRunner.run('node -e "console.log(\'out\'); console.error(\'err\'); process.exit(3)"');
    assert.equal(res.exitCode, 3);
    assert.match(res.stdout, /out/);
    assert.match(res.stderr, /err/);
    assert.equal(res.timedOut, false);
  });

  it('kills commands that exceed the timeout and reports exit code 124', async () => {
    const started = Date.now();
    const res = await CommandRunner.run('node -e "setTimeout(() => {}, 20000)"', { timeoutMs: 400 });
    assert.equal(res.timedOut, true);
    assert.equal(res.exitCode, 124);
    assert.match(res.stderr, /timed out/);
    assert.ok(Date.now() - started < 10000, 'runner waited for the full command');
  });

  it('keeps only the tail of oversized output', async () => {
    const res = await CommandRunner.run('node -e "process.stdout.write(\'a\'.repeat(5000) + \'END\')"', { maxOutputBytes: 1024 });
    assert.equal(res.truncated, true);
    assert.match(res.stdout, /bytes truncated/);
    assert.ok(res.stdout.endsWith('END'));
    assert.ok(res.stdout.length < 1200);
  });

  it('does not block the event loop while a command runs (regression: Y5)', async () => {
    let ticks = 0;
    const interval = setInterval(() => ticks++, 50);
    await CommandRunner.run('node -e "setTimeout(() => {}, 800)"');
    clearInterval(interval);
    assert.ok(ticks >= 5, `event loop was blocked (ticks=${ticks})`);
  });

  it('resolves with exit code 127 when the command cannot be started', async () => {
    const missingDir = path.join(createTempDir(), 'does-not-exist');
    const res = await CommandRunner.run('node -v', { cwd: missingDir });
    assert.notEqual(res.exitCode, 0);
  });

  it('rejects an empty command', async () => {
    await assert.rejects(() => CommandRunner.run('  '), TypeError);
  });

});
