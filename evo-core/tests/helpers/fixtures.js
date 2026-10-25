/**
 * EVO-CORE TEST FIXTURES
 * Every test works inside its own temporary directory / git repository,
 * so running the suite never touches this project's files or git history.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const created = new Set();

/**
 * Creates an empty temporary directory that is removed by cleanupTempDirs().
 */
export function createTempDir(prefix = 'evocore-test-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  created.add(dir);
  return dir;
}

/**
 * Runs git inside a directory without going through a shell.
 */
export function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Creates a temporary git repository with a local identity and an initial commit.
 * @param {Record<string, string>} files Relative path -> file content
 */
export function createGitRepo(files = { 'README.md': '# fixture\n' }) {
  const dir = createTempDir('evocore-repo-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'fixture@evocore.test');
  git(dir, 'config', 'user.name', 'EvoCore Fixture');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false');
  writeFiles(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture: initial commit');
  return dir;
}

/**
 * Writes several files relative to a base directory, creating parents.
 */
export function writeFiles(baseDir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}

/**
 * Removes every directory created through this module.
 */
export function cleanupTempDirs() {
  for (const dir of created) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
  created.clear();
}
