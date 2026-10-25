/**
 * EVO-CORE NATIVE HTTP REST & WEB SERVER
 * Zero-Fat web server built on Node.js native 'node:http'.
 * Serves the full control GUI and exposes JSON REST endpoints.
 *
 * Security model (the API can run test commands and change git state):
 * - binds to 127.0.0.1 by default; Host header is checked against DNS rebinding,
 * - every /api call except /api/health needs the per-start bearer token,
 * - cross-origin requests are refused (no CORS headers, Origin must match),
 * - POST bodies must be JSON and at most 1 MB,
 * - commands come only from the evocore.config.json allowlist, never from the request.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { EvoCore } from './evocore.js';
import { MQLValidator } from './mql_validator.js';
import { ASTScanner } from './ast_scanner.js';
import { CommandRunner } from './runner.js';
import { Gatekeeper } from './gatekeeper.js';
import { JobQueue } from './job_queue.js';
import { LLMBridge } from './llm_bridge.js';
import { EvolutionLoop, EvolveError, metricFromPattern } from './evolver.js';
import { VERSION } from './version.js';
import { getFullControlHTML } from './web_ui.js';

const MAX_BODY_BYTES = 1024 * 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const SCANNABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.py', '.mq4', '.mq5', '.mqh', '.cpp', '.h']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isLoopback(host) {
  return LOOPBACK_HOSTS.has(host) || /^127\./.test(host);
}

function hostnameOf(hostHeader = '') {
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0];
}

function optionalString(body, key, max) {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `"${key}" must be a string.`);
  if (value.length > max) throw new HttpError(400, `"${key}" is longer than ${max} characters.`);
  return value;
}

function safeTokenEqual(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class EvoServer {
  /**
   * @param {object} [options]
   * @param {number} [options.port] Port (0 = random); defaults to config server.port
   * @param {string} [options.host] Bind address; defaults to config server.host (127.0.0.1)
   * @param {string} [options.rootDir] Project root
   * @param {string} [options.token] API token; defaults to EVO_TOKEN or a random per-start token
   * @param {object} [options.config] evocore.config.json overrides
   * @param {() => object} [options.llmFactory] Creates the candidate generator for /api/evolve.
   *        Defaults to LLMBridge configured from the server's environment (EVO_PROVIDER, ...);
   *        requests can never choose the provider, endpoint or key.
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.evo = new EvoCore({ rootDir: this.rootDir, config: options.config });
    this.llmFactory = options.llmFactory || (() => new LLMBridge());
    this.port = options.port !== undefined ? options.port : this.evo.config.server.port;
    this.host = options.host || this.evo.config.server.host;
    this.token = options.token || process.env.EVO_TOKEN || crypto.randomBytes(24).toString('base64url');
    this.queue = new JobQueue();
    this.server = null;
  }

  get baseUrl() {
    const host = this.host.includes(':') ? `[${this.host}]` : this.host;
    const display = host === '0.0.0.0' || host === '[::]' ? 'localhost' : host;
    return `http://${display}:${this.port}`;
  }

  /**
   * URL that opens the UI already authenticated (token travels in the fragment, never to the server log).
   */
  get uiUrl() {
    return `${this.baseUrl}/#token=${encodeURIComponent(this.token)}`;
  }

  /**
   * Starts the HTTP server.
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handle(req, res).catch((err) => this.sendError(res, err));
      });

      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.port = this.server.address().port;
        resolve(this.baseUrl);
      });
    });
  }

  /**
   * Stops accepting requests, waits for running jobs, then closes the database.
   */
  async stop() {
    if (!this.server) return;
    await new Promise((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections?.();
    });
    this.server = null;
    await this.queue.idle();
    this.evo.close();
  }

  setCommonHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
  }

  sendJson(res, status, payload) {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  }

  sendError(res, err) {
    if (err instanceof HttpError) {
      this.sendJson(res, err.status, { error: err.message });
      return;
    }
    console.error('[evocore] request failed:', Gatekeeper.maskSecrets(err?.stack || String(err)));
    this.sendJson(res, 500, { error: Gatekeeper.maskSecrets(err?.message || 'Internal server error') });
  }

  /**
   * Rejects requests whose Host or Origin does not belong to this server.
   */
  checkRequestOrigin(req) {
    const hostHeader = req.headers.host || '';
    const hostname = hostnameOf(hostHeader).replace(/^\[|\]$/g, '');
    // A loopback server must only answer to loopback names (blocks DNS rebinding).
    if (isLoopback(this.host) && !isLoopback(hostname)) {
      throw new HttpError(403, 'Host not allowed.');
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${hostHeader}`) {
      throw new HttpError(403, 'Cross-origin requests are not allowed.');
    }
  }

  checkAuth(req) {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match || !safeTokenEqual(match[1].trim(), this.token)) {
      throw new HttpError(401, 'Missing or invalid API token.');
    }
  }

  async readJson(req) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json.');

    const declared = Number(req.headers['content-length'] || 0);
    if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large (max 1 MB).');

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large (max 1 MB).');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw.trim() === '') return {};
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Invalid JSON payload');
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'JSON body must be an object.');
    }
    return body;
  }

  /**
   * Validates a ratchet step request. Commands are referenced by allowlisted id only.
   */
  parseStepRequest(body) {
    if (body.testCommand !== undefined) {
      throw new HttpError(400, 'testCommand is not accepted over HTTP; use testCommandId from evocore.config.json.');
    }
    const testCommandId = optionalString(body, 'testCommandId', 64) || 'default';
    if (!Object.hasOwn(this.evo.config.testCommands, testCommandId)) {
      throw new HttpError(400, `Unknown testCommandId "${testCommandId}".`);
    }
    const domain = optionalString(body, 'domain', 40) || 'GENERAL';
    if (!/^[A-Za-z0-9_]+$/.test(domain)) throw new HttpError(400, '"domain" may contain letters, digits and _ only.');
    const baselineScore = body.baselineScore === undefined ? 0 : Number(body.baselineScore);
    if (!Number.isFinite(baselineScore)) throw new HttpError(400, '"baselineScore" must be a number.');

    return {
      taskTitle: optionalString(body, 'taskTitle', 200) || 'Web UI Task',
      hypothesis: optionalString(body, 'hypothesis', 500),
      domain,
      signature: optionalString(body, 'signature', 200),
      rootCause: optionalString(body, 'rootCause', 2000) || '',
      rule: optionalString(body, 'rule', 4000) || '',
      verifiedCode: optionalString(body, 'verifiedCode', 20000) || '',
      baselineScore,
      testCommandId
    };
  }

  describeLLM() {
    try {
      const llm = this.llmFactory();
      return { ok: true, provider: llm.describe?.() || 'custom' };
    } catch (err) {
      return { ok: false, provider: null, error: Gatekeeper.maskSecrets(err.message) };
    }
  }

  /**
   * Validates an evolve request; the target file is checked before anything is queued.
   */
  parseEvolveRequest(body) {
    if (body.testCommand !== undefined) {
      throw new HttpError(400, 'testCommand is not accepted over HTTP; use testCommandId from evocore.config.json.');
    }
    const step = this.parseStepRequest({ ...body, testCommand: undefined });
    const instruction = optionalString(body, 'instruction', 4000);
    if (!instruction) throw new HttpError(400, '"instruction" is required.');
    const file = optionalString(body, 'file', 500);
    const maxIterations = body.maxIterations === undefined ? 3 : Number(body.maxIterations);
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10) {
      throw new HttpError(400, '"maxIterations" must be an integer between 1 and 10.');
    }
    const metricPattern = optionalString(body, 'metricPattern', 200);
    try {
      if (metricPattern) metricFromPattern(metricPattern);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    return { ...step, taskTitle: optionalString(body, 'taskTitle', 200), file, instruction, maxIterations, metricPattern };
  }

  publicConfig() {
    const { config } = this.evo;
    return {
      version: VERSION,
      llm: this.describeLLM(),
      scope: config.scope,
      exclude: config.exclude,
      testCommands: Object.fromEntries(Object.entries(config.testCommands).map(([id, cmd]) => [id, Gatekeeper.maskSecrets(cmd)])),
      timeoutMs: config.timeoutMs,
      maxConsecutiveFailures: config.maxConsecutiveFailures,
      promotionThreshold: config.promotionThreshold,
      strictImprovement: config.strictImprovement
    };
  }

  async handle(req, res) {
    this.setCommonHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    const method = req.method;

    this.checkRequestOrigin(req);

    if (method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'GET, POST' });
      res.end();
      return;
    }

    // 1. Serve Full Control Web UI (static; data is loaded through the authenticated API)
    if (pathname === '/' && method === 'GET') {
      const nonce = crypto.randomBytes(16).toString('base64');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      });
      res.end(getFullControlHTML({ nonce, version: VERSION }));
      return;
    }

    if (pathname === '/api/health' && method === 'GET') {
      this.sendJson(res, 200, { ok: true, version: VERSION });
      return;
    }

    if (!pathname.startsWith('/api/')) throw new HttpError(404, 'Not found');
    this.checkAuth(req);

    if (method === 'GET') return this.handleGet(pathname, url, res);
    if (method === 'POST') return this.handlePost(pathname, await this.readJson(req), res);
    throw new HttpError(405, 'Method not allowed');
  }

  handleGet(pathname, url, res) {
    const params = url.searchParams;
    const limit = Number.parseInt(params.get('limit') || '100', 10);

    if (pathname === '/api/status') {
      return this.sendJson(res, 200, { ...this.evo.getStatus(), queue: { running: this.queue.running, pending: this.queue.pending } });
    }
    if (pathname === '/api/config') {
      return this.sendJson(res, 200, this.publicConfig());
    }
    if (pathname === '/api/skills') {
      const domain = params.get('domain') || null;
      const skills = params.get('all') === '1' ? this.evo.skills.getAllSkills(domain) : this.evo.skills.getActiveSkills(domain);
      return this.sendJson(res, 200, skills.map(({ path: _absolutePath, ...skill }) => skill));
    }
    if (pathname === '/api/memory') {
      const experiences = this.evo.memory.findRelevantExperiences(params.get('q') || '', params.get('domain') || null, {
        limit,
        includeArchived: params.get('all') === '1'
      });
      return this.sendJson(res, 200, experiences);
    }
    if (pathname === '/api/history') {
      return this.sendJson(res, 200, this.evo.memory.listTrajectories({ limit }));
    }
    if (pathname === '/api/jobs') {
      return this.sendJson(res, 200, this.queue.list());
    }
    const jobMatch = pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/);
    if (jobMatch) {
      const job = this.queue.get(jobMatch[1]);
      if (!job) throw new HttpError(404, 'Job not found');
      return this.sendJson(res, 200, job);
    }
    throw new HttpError(404, 'Endpoint not found');
  }

  async handlePost(pathname, body, res) {
    // Ratchet trial: queued, returns a job id to poll.
    if (pathname === '/api/ratchet/step') {
      const request = this.parseStepRequest(body);
      const job = this.queue.enqueue('ratchet.step', () => this.evo.executeEvolutionStep(request));
      return this.sendJson(res, 202, { jobId: job.id, status: job.status });
    }

    // Autonomous evolve loop: queued; progress events are exposed on the job.
    if (pathname === '/api/evolve') {
      const request = this.parseEvolveRequest(body);
      let llm;
      try {
        llm = this.llmFactory();
      } catch (err) {
        throw new HttpError(400, `LLM is not configured: ${Gatekeeper.maskSecrets(err.message)}`);
      }
      const loop = new EvolutionLoop(this.evo, { llm });
      try {
        loop.resolveTarget(request.file);
      } catch (err) {
        if (err instanceof EvolveError) throw new HttpError(400, err.message);
        throw err;
      }
      const job = this.queue.enqueue('evolve', ({ progress }) => {
        loop.onProgress = progress;
        return loop.run(request);
      });
      return this.sendJson(res, 202, { jobId: job.id, status: job.status });
    }

    if (pathname === '/api/ratchet/rollback') {
      const job = await this.queue.run('ratchet.rollback', async () => this.evo.ratchet.rollback('manual rollback (web)'));
      if (job.status === 'failed') throw new HttpError(500, job.error);
      return this.sendJson(res, 200, job.result);
    }

    if (pathname === '/api/circuit/reset') {
      const job = await this.queue.run('circuit.reset', async () => this.evo.resetCircuitBreaker());
      return this.sendJson(res, 200, job.result);
    }

    if (pathname === '/api/tests/run') {
      const testCommandId = optionalString(body, 'testCommandId', 64) || 'default';
      if (!Object.hasOwn(this.evo.config.testCommands, testCommandId)) throw new HttpError(400, `Unknown testCommandId "${testCommandId}".`);
      const command = this.evo.config.testCommands[testCommandId];
      const job = this.queue.enqueue('tests.run', async () => {
        const run = await CommandRunner.run(command, {
          cwd: this.evo.rootDir,
          timeoutMs: this.evo.config.timeoutMs,
          maxOutputBytes: this.evo.config.maxOutputBytes
        });
        return {
          exitCode: run.exitCode,
          timedOut: run.timedOut,
          durationMs: run.durationMs,
          output: Gatekeeper.maskSecrets(`${run.stdout}${run.stderr ? `\n${run.stderr}` : ''}`)
        };
      });
      return this.sendJson(res, 202, { jobId: job.id, status: job.status });
    }

    if (pathname === '/api/audit/mql') {
      const code = optionalString(body, 'code', MAX_BODY_BYTES) || '';
      return this.sendJson(res, 200, MQLValidator.auditMQL(code));
    }

    if (pathname === '/api/scan') {
      const code = optionalString(body, 'code', MAX_BODY_BYTES) || '';
      const ext = (optionalString(body, 'ext', 8) || '.js').toLowerCase();
      if (!SCANNABLE_EXTENSIONS.has(ext)) throw new HttpError(400, `Unsupported extension "${ext}".`);
      return this.sendJson(res, 200, ASTScanner.scanSource(code, ext));
    }

    if (pathname === '/api/memory/regress') {
      const signature = optionalString(body, 'signature', 200);
      if (!signature) throw new HttpError(400, '"signature" is required.');
      const result = this.evo.recordManualRegression(signature);
      if (!result) throw new HttpError(404, 'Unknown signature');
      return this.sendJson(res, 200, result);
    }

    throw new HttpError(404, 'Endpoint not found');
  }
}
