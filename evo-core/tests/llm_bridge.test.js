import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { LLMBridge, LLMError } from '../core/llm_bridge.js';

// Local fake of an OpenAI-compatible /chat/completions endpoint.
function startFakeApi(handler) {
  return new Promise((resolve) => {
    const requests = [];
    const server = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const entry = { method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null };
      requests.push(entry);
      handler(entry, res, requests.length);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}/v1` }));
  });
}

const reply = (res, content) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
};

describe('EvoCore LLM Bridge (OpenAI-compatible + mock)', () => {

  let api;
  let flakyCalls = 0;
  before(async () => {
    api = await startFakeApi((req, res) => {
      // 'flaky' fails every first attempt and succeeds on the retry.
      if (req.body?.model === 'flaky' && flakyCalls++ % 2 === 0) {
        res.writeHead(429, { 'Retry-After': '0' });
        res.end('slow down');
        return;
      }
      if (req.body?.model === 'broken') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"bad model"}');
        return;
      }
      if (req.body?.model === 'slow') return; // never answers
      reply(res, 'Here you go:\n```js\nexport function calculate() { return 100; }\n```\nDone.');
    });
  });

  after(() => new Promise(resolve => {
    api.server.closeAllConnections();
    api.server.close(resolve);
  }));

  it('sends a well-formed chat-completions request and extracts the fenced code', async () => {
    const bridge = new LLMBridge({ provider: 'openai', baseUrl: `${api.url}/`, apiKey: 'test-key', model: 'm1' });
    const code = await bridge.generateCandidate({
      taskTitle: 'Return 100',
      targetFileContent: 'export function calculate() { return 10; }',
      activeSkills: [{ name: 'S', version: '1.0.0', body: 'rule' }]
    });

    assert.equal(code, 'export function calculate() { return 100; }');
    const last = api.requests.at(-1);
    assert.equal(last.url, '/v1/chat/completions');
    assert.equal(last.headers.authorization, 'Bearer test-key');
    assert.equal(last.body.model, 'm1');
    assert.equal(last.body.messages[0].role, 'system');
    assert.match(last.body.messages[0].content, /Skill: S \(v1\.0\.0\)/);
    assert.match(last.body.messages[1].content, /return 10;/);
  });

  it('works without an API key for local servers (no silent fallback to mock)', async () => {
    const bridge = new LLMBridge({ provider: 'openai', baseUrl: api.url, apiKey: '', model: 'local' });
    const code = await bridge.generateCandidate({ taskTitle: 't', targetFileContent: 'x' });
    assert.match(code, /return 100/);
    assert.equal(api.requests.at(-1).headers.authorization, undefined);
  });

  it('retries 429 responses honouring Retry-After, but not client errors', async () => {
    const flaky = new LLMBridge({ provider: 'openai', baseUrl: api.url, model: 'flaky', retryBaseMs: 1 });
    const before = api.requests.length;
    await flaky.callApi('s', 'u');
    assert.equal(api.requests.length - before, 2);

    const broken = new LLMBridge({ provider: 'openai', baseUrl: api.url, model: 'broken', retryBaseMs: 1 });
    const start = api.requests.length;
    await assert.rejects(() => broken.callApi('s', 'u'), (err) => err instanceof LLMError && err.status === 400);
    assert.equal(api.requests.length - start, 1);
  });

  it('times out hanging requests with a clear error', async () => {
    const slow = new LLMBridge({ provider: 'openai', baseUrl: api.url, model: 'slow', timeoutMs: 200, maxRetries: 0 });
    await assert.rejects(() => slow.callApi('s', 'u'), /timed out after 200 ms/);
  });

  it('rejects providers whose protocol is not implemented instead of mis-sending', () => {
    assert.throws(() => new LLMBridge({ provider: 'gemini' }), /not supported/);
  });

  it('keeps identifiers intact in prompts while masking real credentials', async () => {
    const bridge = new LLMBridge({ provider: 'openai', baseUrl: api.url, model: 'm2' });
    await bridge.generateCandidate({
      taskTitle: 't',
      targetFileContent: 'double calculateMovingAverage20 = 0;\nconst token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";'
    });
    const prompt = api.requests.at(-1).body.messages[1].content;
    assert.match(prompt, /calculateMovingAverage20/);
    assert.ok(!prompt.includes('ghp_abcdefghijklmnopqrstuvwxyz0123456789'));
  });

  it('extracts code from fences with language tags and falls back to raw text', () => {
    const bridge = new LLMBridge({ provider: 'mock' });
    assert.equal(bridge.extractCode('```c++\nint x;\n```', 'old'), 'int x;');
    assert.equal(bridge.extractCode('  plain  ', 'old'), 'plain');
    assert.equal(bridge.extractCode(null, 'old'), 'old');
  });

});
