/**
 * EVO-CORE NATIVE HTTP REST & WEB SERVER
 * Zero-Fat web server built on Node.js native 'node:http'.
 * Serves the full control GUI and exposes JSON REST endpoints.
 */

import http from 'node:http';
import { execSync } from 'node:child_process';
import { EvoCore } from './evocore.js';
import { MQLValidator } from './mql_validator.js';
import { getFullControlHTML } from './web_ui.js';

export class EvoServer {
  constructor(options = {}) {
    this.port = options.port !== undefined ? options.port : 3777;
    this.rootDir = options.rootDir || process.cwd();
    this.evo = new EvoCore({ rootDir: this.rootDir });
    this.server = null;
  }

  /**
   * Starts the HTTP server.
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const pathname = url.pathname;
        const method = req.method;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          // 1. Serve Full Control Web UI
          if (pathname === '/' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getFullControlHTML(this.port));
            return;
          }

          // 2. GET /api/status
          if (pathname === '/api/status' && method === 'GET') {
            const status = this.evo.getStatus();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status));
            return;
          }

          // 3. GET /api/skills
          if (pathname === '/api/skills' && method === 'GET') {
            const domain = url.searchParams.get('domain') || null;
            const skills = this.evo.skills.getActiveSkills(domain);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skills));
            return;
          }

          // 4. GET /api/memory
          if (pathname === '/api/memory' && method === 'GET') {
            const keyword = url.searchParams.get('q') || '';
            const domain = url.searchParams.get('domain') || null;
            const experiences = this.evo.memory.findRelevantExperiences(keyword, domain);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(experiences));
            return;
          }

          // Parse JSON body for POST endpoints
          let body = {};
          if (method === 'POST') {
            const buffers = [];
            for await (const chunk of req) {
              buffers.push(chunk);
            }
            const rawBody = Buffer.concat(buffers).toString('utf8');
            if (rawBody.trim().length > 0) {
              try {
                body = JSON.parse(rawBody);
              } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
                return;
              }
            }
          }

          // 5. POST /api/ratchet/step
          if (pathname === '/api/ratchet/step' && method === 'POST') {
            const stepResult = this.evo.executeEvolutionStep(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stepResult));
            return;
          }

          // 6. POST /api/ratchet/rollback
          if (pathname === '/api/ratchet/rollback' && method === 'POST') {
            const ok = this.evo.ratchet.rollback();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: ok, action: 'ROLLED_BACK' }));
            return;
          }

          // 7. POST /api/audit/mql
          if (pathname === '/api/audit/mql' && method === 'POST') {
            const auditResult = MQLValidator.auditMQL(body.code || '');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(auditResult));
            return;
          }

          // 8. POST /api/memory/regress
          if (pathname === '/api/memory/regress' && method === 'POST') {
            const utility = this.evo.memory.reportRegression(body.signature || '');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ signature: body.signature, newUtility: utility }));
            return;
          }

          // 9. POST /api/tests/run
          if (pathname === '/api/tests/run' && method === 'POST') {
            let output = '';
            let exitCode = 0;
            try {
              output = execSync('npm test', { cwd: this.rootDir, encoding: 'utf8', timeout: 30000 });
              exitCode = 0;
            } catch (err) {
              exitCode = err.status || 1;
              output = err.stdout || err.stderr || err.message;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ exitCode, output }));
            return;
          }

          // 404 Not Found
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      this.server.listen(this.port, () => {
        const actualPort = this.server.address().port;
        this.port = actualPort;
        resolve(`http://localhost:${actualPort}`);
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stops the server.
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.evo.close();
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
