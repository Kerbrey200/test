/**
 * EVO-CORE GIT WORKSPACE
 * Shell-free git operations restricted to a configured scope:
 * - lists and diffs only in-scope changes (untracked files included),
 * - commits exactly the evaluated files (other staged work is left alone),
 * - rolls back by stashing, so rejected work is always recoverable.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class GitError extends Error {}

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
const FALLBACK_IDENTITY = ['-c', 'user.name=EvoCore', '-c', 'user.email=evocore@localhost'];

export class GitWorkspace {
  /**
   * @param {object} options
   * @param {string} options.repoDir Directory the scope is relative to (inside a git work tree)
   * @param {string[]} [options.scope=['.']] In-scope pathspecs relative to repoDir
   * @param {string[]} [options.exclude=[]] Excluded pathspecs relative to repoDir
   * @param {number} [options.maxUntrackedBytes=524288] Larger new files are reported as binary
   */
  constructor({ repoDir, scope = ['.'], exclude = [], maxUntrackedBytes = 512 * 1024 }) {
    this.repoDir = path.resolve(repoDir);
    this.scope = [...scope];
    this.exclude = [...exclude];
    this.maxUntrackedBytes = maxUntrackedBytes;
    this._topLevel = null;
  }

  /**
   * Runs git with an argument vector (no shell, so no injection).
   */
  git(args, { cwd = this.repoDir, input, allowFail = false } = {}) {
    try {
      return execFileSync('git', args, {
        cwd,
        input,
        env: GIT_ENV,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (err) {
      if (allowFail) return null;
      const detail = String(err.stderr || err.message || '').trim().split('\n').slice(-3).join(' | ');
      const subcommand = args.find((arg, i) => !arg.startsWith('-') && args[i - 1] !== '-c') || args[0];
      throw new GitError(`git ${subcommand} failed: ${detail}`);
    }
  }

  get topLevel() {
    if (!this._topLevel) {
      this._topLevel = path.resolve(this.git(['rev-parse', '--show-toplevel']).trim());
    }
    return this._topLevel;
  }

  /**
   * Throws a GitError unless repoDir is inside a work tree that has at least one commit.
   */
  assertReady() {
    if (this.git(['rev-parse', '--is-inside-work-tree'], { allowFail: true })?.trim() !== 'true') {
      throw new GitError(`Not a git work tree: ${this.repoDir}`);
    }
    if (this.git(['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true }) === null) {
      throw new GitError('Repository has no commits yet; create an initial commit first.');
    }
  }

  pathspecs() {
    return [...this.scope, ...this.exclude.map(entry => `:(exclude)${entry}`)];
  }

  /**
   * Lists in-scope changes (tracked and untracked) with repo-root-relative paths.
   * @returns {{path:string, index:string, worktree:string, untracked:boolean}[]}
   */
  changedFiles() {
    const raw = this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...this.pathspecs()]);
    const entries = raw.split('\0');
    const files = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.length < 4) continue;
      const index = entry[0];
      const worktree = entry[1];
      const filePath = entry.slice(3);
      if (index === '!') continue;
      files.push({ path: filePath, index, worktree, untracked: index === '?' });
      // Renames and copies are followed by the original path, which is also part of the change.
      if (index === 'R' || index === 'C') {
        const original = entries[++i];
        if (original) files.push({ path: original, index: 'D', worktree: ' ', untracked: false });
      }
    }

    return files;
  }

  /**
   * Unified diff of all in-scope changes against HEAD, including untracked files.
   */
  diff(files = this.changedFiles()) {
    const tracked = this.git(['-c', 'core.quotepath=off', 'diff', 'HEAD', '--no-color', '--no-ext-diff', '--', ...this.pathspecs()]);
    const untracked = files.filter(f => f.untracked).map(f => this.untrackedDiff(f.path));
    return [tracked.trimEnd(), ...untracked].filter(Boolean).join('\n') + '\n';
  }

  untrackedDiff(relPath) {
    const fullPath = path.join(this.topLevel, relPath);
    const header = `diff --git a/${relPath} b/${relPath}\nnew file mode 100644\n`;
    let content;
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size > this.maxUntrackedBytes) {
        return `${header}Binary files /dev/null and b/${relPath} differ`;
      }
      content = fs.readFileSync(fullPath);
    } catch {
      return `${header}Binary files /dev/null and b/${relPath} differ`;
    }
    if (content.includes(0)) return `${header}Binary files /dev/null and b/${relPath} differ`;

    const lines = content.toString('utf8').replace(/\r\n/g, '\n').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return `${header}--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(l => `+${l}`).join('\n')}`;
  }

  /**
   * Counts added/removed lines in a unified diff.
   */
  static diffStats(diffText = '') {
    let added = 0;
    let removed = 0;
    for (const line of diffText.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added++;
      else if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }
    return { added, removed, total: added + removed };
  }

  /**
   * Content fingerprints of files, used to prove nothing changed between audit and commit.
   */
  fingerprint(files) {
    const prints = {};
    for (const { path: relPath } of files) {
      const fullPath = path.join(this.topLevel, relPath);
      try {
        prints[relPath] = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      } catch {
        prints[relPath] = null;
      }
    }
    return prints;
  }

  pathspecInput(files) {
    return files.map(f => f.path).join('\0') + '\0';
  }

  hasIdentity() {
    return Boolean(this.git(['config', 'user.email'], { allowFail: true })?.trim());
  }

  /**
   * Commits exactly the given files. Message is passed as an argument (never through a shell).
   * @returns {string} Short hash of the new commit
   */
  commitFiles(message, files) {
    if (!files.length) throw new GitError('Nothing to commit.');
    const cwd = this.topLevel;
    const input = this.pathspecInput(files);
    const identity = this.hasIdentity() ? [] : FALLBACK_IDENTITY;

    this.git(['-c', 'core.quotepath=off', 'add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd, input });
    this.git([...identity, 'commit', '--quiet', '-m', message, '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd, input });
    return this.git(['rev-parse', '--short', 'HEAD']).trim();
  }

  /**
   * Moves the given files' changes into a git stash (recoverable with `git stash apply <ref>`).
   * @returns {string|null} Stash commit hash, or null when nothing was stashed
   */
  stashFiles(message, files) {
    if (!files.length) return null;
    const cwd = this.topLevel;
    const before = this.git(['rev-parse', '--quiet', '--verify', 'refs/stash'], { allowFail: true })?.trim() || null;
    const identity = this.hasIdentity() ? [] : FALLBACK_IDENTITY;

    this.git([...identity, 'stash', 'push', '--include-untracked', '-m', message,
      '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd, input: this.pathspecInput(files) });

    const after = this.git(['rev-parse', '--quiet', '--verify', 'refs/stash'], { allowFail: true })?.trim() || null;
    return after && after !== before ? after : null;
  }

  headShort() {
    return this.git(['rev-parse', '--short', 'HEAD']).trim();
  }
}
