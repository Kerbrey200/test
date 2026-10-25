import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EvoCore } from '../core/evocore.js';
import { EvolutionLoop, EvolveError, metricFromPattern } from '../core/evolver.js';
import { LLMBridge, LLMError } from '../core/llm_bridge.js';
import { createGitRepo, git, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

const CALC_TEST = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { calculate } from '../src/calc.js';",
  "test('calculate returns 100', () => { assert.equal(calculate(), 100); });",
  ''
].join('\n');

const GOOD = 'export function calculate() { return 100; }\n';
const BAD = 'export function calculate() { return 42; }\n';

function makeProject(extraConfig = {}) {
  const rootDir = createGitRepo({
    'package.json': '{ "type": "module" }\n',
    'src/calc.js': 'export function calculate() { return 10; }\n',
    'test/calc.test.js': CALC_TEST,
    'evocore.config.json': JSON.stringify({ scope: ['src'], testCommands: { default: 'node --test' }, ...extraConfig })
  });
  return { rootDir, evo: new EvoCore({ rootDir }) };
}

// Replays scripted replies; a function reply receives the generateCandidate arguments.
class ScriptedLLM {
  constructor(replies) {
    this.replies = [...replies];
    this.calls = [];
  }

  describe() {
    return 'scripted';
  }

  async generateCandidate(args) {
    this.calls.push(args);
    const reply = this.replies.shift();
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(args) : reply;
  }
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('EvoCore Autonomous Evolution Loop', () => {

  after(cleanupTempDirs);

  it('learns from a failed attempt and commits the second candidate', async () => {
    const { rootDir, evo } = makeProject();
    const llm = new ScriptedLLM([BAD, GOOD]);
    const events = [];
    const loop = new EvolutionLoop(evo, { llm, onProgress: e => events.push(e.type) });

    const run = await loop.run({ file: 'src/calc.js', instruction: 'Make calculate return 100', signature: 'CALC_100', rule: 'Return the target constant' });

    assert.equal(run.success, true);
    assert.equal(run.iterations, 2);
    assert.deepEqual(run.attempts.map(a => a.action), ['ROLLED_BACK', 'COMMITTED']);
    assert.equal(read(rootDir, 'src/calc.js'), GOOD);
    assert.equal(git(rootDir, 'show', '--name-only', '--format=', 'HEAD'), 'src/calc.js');
    assert.equal(git(rootDir, 'status', '--porcelain', '--', 'src'), '', 'no leftover candidate in scope');

    // The second call received the first failure as feedback, including the test output.
    assert.equal(llm.calls[0].previousErrors.length, 0);
    assert.match(llm.calls[1].previousErrors[0], /Result: ROLLED_BACK/);
    assert.match(llm.calls[1].previousErrors[0], /42/);

    assert.deepEqual(events, ['start', 'generating', 'testing', 'result', 'generating', 'testing', 'result', 'done']);
    assert.equal(evo.memory.countTrajectories(), 2);
    assert.equal(evo.memory.getExperience('CALC_100').regressions, 0, 'intermediate failures are not regressions');
    assert.equal(evo.skills.getActiveSkills().length, 1);
    evo.close();
  });

  it('runs end-to-end with the built-in mock provider', async () => {
    const { rootDir, evo } = makeProject();
    const loop = new EvolutionLoop(evo, { llm: new LLMBridge({ provider: 'mock', env: {} }) });
    const run = await loop.run({ file: 'src/calc.js', instruction: 'calculate must return 100;' });
    assert.equal(run.success, true);
    assert.equal(run.provider, 'mock (offline)');
    assert.equal(read(rootDir, 'src/calc.js'), GOOD);
    evo.close();
  });

  it('refuses unsafe targets and a dirty working tree', async () => {
    const { rootDir, evo } = makeProject({ exclude: ['src/vendor'] });
    writeFiles(rootDir, { 'src/vendor/lib.js': 'x\n', 'src/creds.js': 'export const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";\n', 'notes.txt': 'n\n' });
    git(rootDir, 'add', '-A');
    git(rootDir, 'commit', '-q', '-m', 'more files');
    const loop = new EvolutionLoop(evo, { llm: new ScriptedLLM([]) });
    const run = (file) => loop.run({ file, instruction: 'x' });

    await assert.rejects(() => run('../outside.js'), /inside the project/);
    await assert.rejects(() => run('notes.txt'), /outside the configured scope/);
    await assert.rejects(() => run('src/vendor/lib.js'), /excluded/);
    await assert.rejects(() => run('src/missing.js'), /not found/);
    await assert.rejects(() => run('src/creds.js'), /masked before reaching the LLM/);
    await assert.rejects(() => loop.run({ file: 'src/calc.js', instruction: '' }), /instruction is required/);
    await assert.rejects(() => loop.run({ file: 'src/calc.js', instruction: 'x', maxIterations: 50 }), /between 1 and 20/);

    writeFiles(rootDir, { 'src/calc.js': 'user work in progress\n' });
    await assert.rejects(() => run('src/calc.js'), (err) => err instanceof EvolveError && /Commit or stash/.test(err.message));
    assert.equal(read(rootDir, 'src/calc.js'), 'user work in progress\n', 'user work untouched');
    evo.close();
  });

  it('never targets test files, even when tests are in scope', async () => {
    const { evo } = makeProject({ scope: ['src', 'test'] });
    const loop = new EvolutionLoop(evo, { llm: new ScriptedLLM([]) });
    await assert.rejects(() => loop.run({ file: 'test/calc.test.js', instruction: 'x' }), /never rewrites test files/);
    evo.close();
  });

  it('rejects empty, identical and placeholder candidates and records one regression per run', async () => {
    const { rootDir, evo } = makeProject();
    evo.memory.recordExperience({ signature: 'SIG', winningFix: 'f' });
    const original = read(rootDir, 'src/calc.js');
    const llm = new ScriptedLLM(['   ', original.replace('\n', '\r\n'), 'const t = "[REDACTED_SECRET]";']);
    const run = await new EvolutionLoop(evo, { llm }).run({ file: 'src/calc.js', instruction: 'x', signature: 'SIG' });

    assert.equal(run.success, false);
    assert.equal(run.stoppedReason, 'ITERATIONS_EXHAUSTED');
    assert.deepEqual(run.attempts.map(a => a.action), ['CANDIDATE_REJECTED', 'CANDIDATE_REJECTED', 'CANDIDATE_REJECTED']);
    assert.match(run.attempts[1].error, /identical/);
    assert.match(run.attempts[2].error, /placeholder/);
    assert.equal(read(rootDir, 'src/calc.js'), original);
    assert.equal(evo.memory.getExperience('SIG').regressions, 1);
    evo.close();
  });

  it('stops on LLM configuration errors but retries transient ones', async () => {
    const { evo } = makeProject();
    const transient = await new EvolutionLoop(evo, { llm: new ScriptedLLM([new LLMError('timed out'), GOOD]) })
      .run({ file: 'src/calc.js', instruction: 'x' });
    assert.equal(transient.success, true);
    assert.deepEqual(transient.attempts.map(a => a.action), ['LLM_ERROR', 'COMMITTED']);

    const fatal = await new EvolutionLoop(evo, { llm: new ScriptedLLM([new LLMError('bad key sk-ant-api03-AbCdEf1234567890XyZ_abcdef', { status: 401 }), GOOD]) })
      .run({ file: 'src/calc.js', instruction: 'x' });
    assert.equal(fatal.stoppedReason, 'LLM_CONFIGURATION_ERROR');
    assert.equal(fatal.iterations, 1);
    assert.ok(!fatal.attempts[0].error.includes('sk-ant-api03'), 'credentials in errors are masked');
    evo.close();
  });

  it('stops when the circuit breaker opens', async () => {
    const { evo } = makeProject({ maxConsecutiveFailures: 2 });
    const run = await new EvolutionLoop(evo, { llm: new ScriptedLLM([BAD, BAD, BAD, BAD]) })
      .run({ file: 'src/calc.js', instruction: 'x', maxIterations: 4 });
    assert.equal(run.stoppedReason, 'CIRCUIT_OPEN');
    assert.equal(run.attempts.filter(a => a.action === 'ROLLED_BACK').length, 2);
    evo.close();
  });

  it('applies a metric pattern against the baseline', async () => {
    const { evo } = makeProject({ testCommands: { scored: 'node -e "console.log(\'score=0.9\')"' } });
    const low = await new EvolutionLoop(evo, { llm: new ScriptedLLM([GOOD]) })
      .run({ file: 'src/calc.js', instruction: 'x', testCommandId: 'scored', metricPattern: 'score=([0-9.]+)', baselineScore: 0.95, maxIterations: 1 });
    assert.equal(low.attempts[0].action, 'ROLLED_BACK');
    assert.equal(low.attempts[0].score, 0.9);

    assert.throws(() => metricFromPattern('('), /Invalid metric pattern/);
    assert.throws(() => metricFromPattern('x'.repeat(300)), /at most 200/);
    assert.throws(() => metricFromPattern('score')('no match'), /did not match/);
    evo.close();
  });

  it('keeps CRLF line endings and the trailing newline of the original file', () => {
    assert.equal(EvolutionLoop.normalizeCandidate('a\nb', 'x\r\ny\r\n'), 'a\r\nb\r\n');
    assert.equal(EvolutionLoop.normalizeCandidate('a\nb\n', 'x\ny'), 'a\nb\n');
  });

});
