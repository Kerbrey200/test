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

  it('rejects unknown providers and incomplete Gemini configuration instead of mis-sending', () => {
    assert.throws(() => new LLMBridge({ provider: 'cohere', env: {} }), /not supported/);
    assert.throws(() => new LLMBridge({ provider: 'gemini', env: {} }), /explicit model/);
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

// Fake Anthropic Messages API speaking the streaming (SSE) protocol the official SDK consumes.
function sse(res, events) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.end();
}

function claudeStream(text, { stopReason = 'end_turn', stopDetails = null } = {}) {
  return [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null, stop_details: stopDetails }, usage: { output_tokens: 12 } },
    { type: 'message_stop' }
  ];
}

describe('EvoCore LLM Bridge: Anthropic (official SDK) and Gemini adapters', () => {

  let claude;
  let gemini;
  let overloadedOnce = 0;

  before(async () => {
    claude = await startFakeApi((req, res) => {
      const prompt = req.body?.messages?.[0]?.content || '';
      if (prompt.includes('REFUSE')) {
        sse(res, claudeStream('', { stopReason: 'refusal', stopDetails: { type: 'refusal', category: 'cyber', explanation: 'x' } }));
      } else if (prompt.includes('TRUNCATE')) {
        sse(res, claudeStream('```js\nexport const v =', { stopReason: 'max_tokens' }));
      } else if (prompt.includes('BAD_REQUEST')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'bad field' } }));
      } else if (prompt.includes('OVERLOADED') && overloadedOnce++ === 0) {
        res.writeHead(529, { 'Content-Type': 'application/json', 'retry-after': '0' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }));
      } else {
        sse(res, claudeStream('Updated:\n```js\nexport const v = 2;\n```'));
      }
    });

    gemini = await startFakeApi((req, res) => {
      const prompt = req.body?.contents?.[0]?.parts?.[0]?.text || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (prompt.includes('BLOCK')) {
        res.end(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }));
      } else {
        res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '```py\nx = 2\n```' }] } }] }));
      }
    });
  });

  after(() => Promise.all([claude, gemini].map(api => new Promise(resolve => {
    api.server.closeAllConnections();
    api.server.close(resolve);
  }))));

  // The SDK appends /v1/messages itself, so its base URL is the server root.
  const claudeBridge = (extra = {}) => new LLMBridge({
    provider: 'anthropic', apiKey: 'sk-ant-test-key-0000000000000000', baseUrl: claude.url.replace(/\/v1$/, ''), env: {}, retryBaseMs: 1, ...extra
  });

  it('calls Claude through the SDK with streaming, effort, fallbacks and no sampling parameters', async () => {
    const code = await claudeBridge().generateCandidate({ taskTitle: 'bump', targetFileContent: 'export const v = 1;' });
    assert.equal(code, 'export const v = 2;');

    const req = claude.requests.at(-1);
    assert.match(req.url, /^\/v1\/messages/);
    assert.equal(req.headers['anthropic-version'], '2026-10-21');
    assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.stream, true);
    assert.equal(req.body.max_tokens, 64000);
    assert.equal(req.body.fallbacks, 'default');
    assert.deepEqual(req.body.output_config, { effort: 'high' });
    assert.equal(req.body.temperature, undefined);
    assert.equal(req.body.top_p, undefined);
    assert.match(req.body.system, /EvoCore Autonomous Mutation Engine/);
  });

  it('omits fallbacks on models without them and effort when disabled', async () => {
    await claudeBridge({ model: 'claude-haiku-5-5', effort: 'none' }).callApi('s', 'u');
    const req = claude.requests.at(-1);
    assert.equal(req.body.fallbacks, undefined);
    assert.equal(req.body.output_config, undefined);
    assert.equal(req.headers['anthropic-beta'], undefined);
  });

  it('turns refusals, truncation and API errors into clear LLMErrors', async () => {
    await assert.rejects(() => claudeBridge().callApi('s', 'REFUSE'), /declined the request \(category: cyber\)/);
    await assert.rejects(() => claudeBridge().callApi('s', 'TRUNCATE'), /max_tokens/);
    await assert.rejects(() => claudeBridge({ maxRetries: 0 }).callApi('s', 'BAD_REQUEST'),
      (err) => err instanceof LLMError && err.status === 400 && /bad field/.test(err.message));
  });

  it('lets the SDK retry overloaded (529) responses', async () => {
    const before = claude.requests.length;
    const text = await claudeBridge().callApi('s', 'OVERLOADED');
    assert.match(text, /export const v = 2/);
    assert.equal(claude.requests.length - before, 2);
  });

  it('calls Gemini generateContent with the API key header and system instruction', async () => {
    const bridge = new LLMBridge({ provider: 'gemini', model: 'gemini-test', apiKey: 'g-key', baseUrl: gemini.url, env: {} });
    const code = await bridge.generateCandidate({ taskTitle: 't', targetFileContent: 'x = 1' });
    assert.equal(code, 'x = 2');

    const req = gemini.requests.at(-1);
    assert.equal(req.url, '/v1/models/gemini-test:generateContent');
    assert.equal(req.headers['x-goog-api-key'], 'g-key');
    assert.match(req.body.systemInstruction.parts[0].text, /EvoCore/);
    assert.equal(req.body.contents[0].role, 'user');

    await assert.rejects(() => bridge.callApi('s', 'BLOCK'), /blocked the prompt \(SAFETY\)/);
    await assert.rejects(() => new LLMBridge({ provider: 'gemini', model: 'm', env: {} }).callApi('s', 'u'), /API key/);
  });

  it('describes the active provider without exposing credentials', () => {
    assert.equal(claudeBridge().describe(), 'anthropic:claude-opus-5-5');
    assert.equal(new LLMBridge({ env: {} }).describe(), 'mock (offline)');
  });

});
