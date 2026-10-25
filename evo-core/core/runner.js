/**
 * EVO-CORE ASYNC COMMAND RUNNER
 * Runs trusted test commands without blocking the event loop, with a hard
 * timeout that kills the whole process tree and a cap on captured output.
 */

import { spawn, spawnSync } from 'node:child_process';

const IS_WINDOWS = process.platform === 'win32';
const activeChildren = new Set();
let exitHookInstalled = false;

/**
 * Keeps the last `limit` bytes of a stream (test summaries live at the end).
 */
class TailBuffer {
  constructor(limit) {
    this.limit = limit;
    this.chunks = [];
    this.size = 0;
    this.dropped = 0;
  }

  push(chunk) {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.limit && this.chunks.length > 0) {
      const overflow = this.size - this.limit;
      const first = this.chunks[0];
      if (first.length <= overflow) {
        this.chunks.shift();
        this.size -= first.length;
        this.dropped += first.length;
      } else {
        this.chunks[0] = first.subarray(overflow);
        this.size -= overflow;
        this.dropped += overflow;
      }
    }
  }

  toString() {
    const text = Buffer.concat(this.chunks).toString('utf8');
    return this.dropped > 0 ? `[... ${this.dropped} bytes truncated ...]\n${text}` : text;
  }
}

function killTree(child) {
  if (!child.pid) return;
  try {
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      // Negative pid targets the process group created by `detached: true`.
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once('exit', () => {
    for (const child of activeChildren) killTree(child);
  });
}

export class CommandRunner {
  /**
   * Runs a shell command and resolves (never rejects) with its outcome.
   * @param {string} command Trusted command line (from config or CLI, never from HTTP input)
   * @param {object} [options]
   * @param {string} [options.cwd]
   * @param {number} [options.timeoutMs=120000]
   * @param {number} [options.maxOutputBytes=1048576] Per stream
   * @param {object} [options.env]
   * @returns {Promise<{exitCode:number, signal:string|null, stdout:string, stderr:string,
   *   durationMs:number, timedOut:boolean, truncated:boolean}>}
   */
  static run(command, { cwd = process.cwd(), timeoutMs = 120000, maxOutputBytes = 1024 * 1024, env } = {}) {
    if (typeof command !== 'string' || command.trim() === '') {
      return Promise.reject(new TypeError('CommandRunner.run requires a non-empty command string.'));
    }
    installExitHook();

    return new Promise((resolve) => {
      const startedAt = Date.now();
      const stdout = new TailBuffer(maxOutputBytes);
      const stderr = new TailBuffer(maxOutputBytes);
      let timedOut = false;
      let settled = false;

      // A node:test parent exports NODE_TEST_CONTEXT, which would switch a nested `node --test`
      // into its internal serialisation format and hide the TAP summary we parse as evidence.
      const childEnv = { ...(env || process.env) };
      delete childEnv.NODE_TEST_CONTEXT;

      const child = spawn(command, {
        cwd,
        env: childEnv,
        shell: true,
        windowsHide: true,
        detached: !IS_WINDOWS,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      activeChildren.add(child);

      let forceTimer = null;
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
        // A grandchild outside the process group may keep the pipes open; do not wait forever.
        forceTimer = setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          finish(124, 'SIGKILL');
        }, 2000);
      }, timeoutMs);

      const finish = (exitCode, signal, errorMessage = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(forceTimer);
        activeChildren.delete(child);
        const stderrText = stderr.toString() + (errorMessage ? `${errorMessage}\n` : '');
        resolve({
          exitCode,
          signal: signal || null,
          stdout: stdout.toString(),
          stderr: timedOut ? `${stderrText}[evocore] Command timed out after ${timeoutMs} ms and was killed.\n` : stderrText,
          durationMs: Date.now() - startedAt,
          timedOut,
          truncated: stdout.dropped > 0 || stderr.dropped > 0
        });
      };

      child.stdout.on('data', chunk => stdout.push(chunk));
      child.stderr.on('data', chunk => stderr.push(chunk));
      child.on('error', err => finish(127, null, `[evocore] Failed to start command: ${err.message}`));
      child.on('close', (code, signal) => {
        if (timedOut) return finish(124, signal);
        finish(code === null ? 1 : code, signal);
      });
    });
  }
}
