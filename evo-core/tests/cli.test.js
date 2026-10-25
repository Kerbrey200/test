import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGitRepo, createTempDir, git, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'evocore.js');

function run(cwd, ...args) {
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.NODE_TEST_CONTEXT;
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe('EvoCore CLI', () => {

  after(cleanupTempDirs);

  it('prints help and version, and exits 1 with help for unknown commands (regression: O6)', () => {
    const dir = createTempDir();
    const help = run(dir, '--help');
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Buyruqlar:/);

    assert.match(run(dir, '--version').stdout.trim(), /^\d+\.\d+\.\d+$/);

    const unknown = run(dir, 'frobnicate');
    assert.equal(unknown.code, 1);
    assert.match(unknown.stderr, /Noma'lum buyruq: "frobnicate"/);
  });

  it('reports a missing file without a stack trace and without creating storage', () => {
    const dir = createTempDir();
    const res = run(dir, 'scan', 'nope.js');
    assert.equal(res.code, 1);
    assert.match(res.stderr, /File not found/);
    assert.doesNotMatch(res.stderr, /\n\s+at /, 'stack trace leaked');
    assert.equal(fs.existsSync(path.join(dir, 'storage')), false);
  });

  it('audit exits 2 on critical MQL issues and 0 on clean code, with JSON output', () => {
    const dir = createTempDir();
    writeFiles(dir, {
      'legacy.mq4': 'int start() { int c = IndicatorCounted(); return(0); }\n',
      'clean.mq5': 'int OnInit() { return(INIT_SUCCEEDED); }\n'
    });
    const bad = run(dir, 'audit', 'legacy.mq4', '--json');
    assert.equal(bad.code, 2);
    assert.equal(JSON.parse(bad.stdout).passed, false);
    assert.equal(run(dir, 'audit', 'clean.mq5').code, 0);
  });

  it('scans files and prints functions with line numbers', () => {
    const dir = createTempDir();
    writeFiles(dir, { 'a.py': 'import os\n\nasync def fetch(url) -> str:\n    pass\n' });
    const res = run(dir, 'scan', 'a.py', '--json');
    assert.equal(res.code, 0);
    assert.deepEqual(JSON.parse(res.stdout).functions.map(f => [f.name, f.line]), [['fetch', 3]]);
  });

  it('runs a ratchet trial end-to-end and reflects it in status and history', () => {
    const repo = createGitRepo({ 'src/app.js': 'export const v = 1;\n' });
    writeFiles(repo, { 'evocore.config.json': JSON.stringify({ scope: ['src'] }) });
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'config');

    writeFiles(repo, { 'src/app.js': 'export const v = 2;\n' });
    const ok = run(repo, 'trial', '--test', 'node -e "process.exit(0)"', '--hypothesis', 'bump v', '--signature', 'BUMP', '--rule', 'Bump v', '--json');
    assert.equal(ok.code, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).action, 'COMMITTED');
    assert.match(git(repo, 'log', '-1', '--format=%s'), /evocore\(ratchet\): bump v/);

    writeFiles(repo, { 'src/app.js': 'broken\n' });
    const failed = run(repo, 'trial', '--test', 'node -e "process.exit(1)"', '--signature', 'BUMP');
    assert.equal(failed.code, 2);
    assert.match(failed.stdout, /REJECTED & ROLLED BACK/);

    const status = JSON.parse(run(repo, 'status', '--json').stdout);
    assert.equal(status.historyCount, 2);
    assert.equal(status.activeSkillsCount, 0, 'regression archived the skill');
    assert.equal(status.circuitBreakerFailures, 1);

    const history = JSON.parse(run(repo, 'history', '--json').stdout);
    assert.deepEqual(history.map(h => h.action), ['ROLLED_BACK', 'COMMITTED']);

    const reset = JSON.parse(run(repo, 'reset-breaker', '--json').stdout);
    assert.equal(reset.consecutiveFailures, 0);
  });

  it('requires a test command for trials and validates numeric options', () => {
    const repo = createGitRepo();
    const missing = run(repo, 'trial');
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /--test/);
    assert.equal(run(repo, 'trial', '--test', 'x', '--baseline', 'abc').code, 1);
    assert.equal(run(repo, 'history', '--limit', '0').code, 1);
  });

  it('rolls back in-scope changes recoverably', () => {
    const repo = createGitRepo({ 'src/app.js': '1\n' });
    writeFiles(repo, { 'src/app.js': '2\n' });
    const res = JSON.parse(run(repo, 'rollback', '--json').stdout);
    assert.ok(res.stashRef);
    assert.equal(fs.readFileSync(path.join(repo, 'src/app.js'), 'utf8'), '1\n');
  });

  it('never prints the node:sqlite experimental warning', () => {
    const res = run(createTempDir(), 'status');
    assert.equal(res.code, 0);
    assert.doesNotMatch(res.stderr, /ExperimentalWarning/);
  });

});
