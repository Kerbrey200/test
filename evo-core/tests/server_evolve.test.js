import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EvoServer } from '../core/server.js';
import { createGitRepo, writeFiles, git, cleanupTempDirs } from './helpers/fixtures.js';

const TOKEN = 'evolve-token-0123456789';
const JSON_AUTH = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const CHECK_100 = 'node -e "import(\'./src/calc.js\').then(m => process.exit(m.calculate() === 100 ? 0 : 1))"';
const GOOD = 'export function calculate() { return 100; }\n';
const BAD = 'export function calculate() { return 7; }\n';

describe('EvoCore Web API: autonomous evolve', () => {

  const replies = [];
  let factoryError = null;
  const rootDir = createGitRepo({
    'package.json': '{ "type": "module" }\n',
    'src/calc.js': 'export function calculate() { return 10; }\n',
    'src/calc.test.js': 'test file\n'
  });
  const server = new EvoServer({
    port: 0,
    rootDir,
    token: TOKEN,
    config: { scope: ['src'], testCommands: { default: CHECK_100 } },
    llmFactory: () => {
      if (factoryError) throw new Error(factoryError);
      return { describe: () => 'scripted', generateCandidate: async () => replies.shift() };
    }
  });
  let baseUrl = '';

  const post = (body) => fetch(`${baseUrl}/api/evolve`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify(body) });

  async function waitForJob(jobId) {
    for (let i = 0; i < 300; i++) {
      const job = await (await fetch(`${baseUrl}/api/jobs/${jobId}`, { headers: JSON_AUTH })).json();
      if (job.status === 'done' || job.status === 'failed') return job;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('job did not finish');
  }

  before(async () => {
    baseUrl = await server.start();
  });

  after(async () => {
    await server.stop();
    cleanupTempDirs();
  });

  it('validates evolve requests before queueing anything', async () => {
    const cases = [
      [{ file: 'src/calc.js', instruction: 'x', testCommand: 'rm -rf /' }, /testCommand is not accepted/],
      [{ file: 'src/calc.js' }, /"instruction" is required/],
      [{ file: '../etc/passwd', instruction: 'x' }, /inside the project/],
      [{ file: 'src/calc.test.js', instruction: 'x' }, /never rewrites test files/],
      [{ file: 'src/calc.js', instruction: 'x', maxIterations: 50 }, /between 1 and 10/],
      [{ file: 'src/calc.js', instruction: 'x', metricPattern: '(' }, /Invalid metric pattern/],
      [{ file: 'src/calc.js', instruction: 'x', testCommandId: 'nope' }, /Unknown testCommandId/]
    ];
    for (const [body, error] of cases) {
      const res = await post(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match((await res.json()).error, error);
    }
    assert.equal(server.queue.list().length, 0);
  });

  it('reports an unconfigured LLM clearly', async () => {
    factoryError = 'Gemini needs an explicit model';
    const res = await post({ file: 'src/calc.js', instruction: 'x' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /LLM is not configured: Gemini needs an explicit model/);
    const config = await (await fetch(`${baseUrl}/api/config`, { headers: JSON_AUTH })).json();
    assert.equal(config.llm.ok, false);
    factoryError = null;
  });

  it('runs the loop as a job with live progress and commits the winning candidate', async () => {
    replies.push(BAD, GOOD);
    const res = await post({ file: 'src/calc.js', instruction: 'Return 100', signature: 'WEB_EVOLVE', rule: 'Return 100' });
    assert.equal(res.status, 202);
    const job = await waitForJob((await res.json()).jobId);

    assert.equal(job.status, 'done', job.error);
    assert.equal(job.result.success, true);
    assert.deepEqual(job.result.attempts.map(a => a.action), ['ROLLED_BACK', 'COMMITTED']);
    assert.deepEqual([...new Set(job.progress.map(e => e.type))], ['start', 'generating', 'testing', 'result', 'done']);
    assert.match(job.result.report, /PROMOTED/);
    assert.match(git(rootDir, 'log', '-1', '--format=%s'), /Return 100 \(evolve src\/calc\.js, iteration 2\)/);

    const config = await (await fetch(`${baseUrl}/api/config`, { headers: JSON_AUTH })).json();
    assert.deepEqual(config.llm, { ok: true, provider: 'scripted' });
  });

  it('fails the job (without touching user work) when the scope is dirty', async () => {
    writeFiles(rootDir, { 'src/calc.js': 'user edit\n' });
    const res = await post({ file: 'src/calc.js', instruction: 'x' });
    const job = await waitForJob((await res.json()).jobId);
    assert.equal(job.status, 'failed');
    assert.match(job.error, /Commit or stash/);
    assert.equal(git(rootDir, 'diff', '--', 'src/calc.js').includes('+user edit'), true);
  });

});
