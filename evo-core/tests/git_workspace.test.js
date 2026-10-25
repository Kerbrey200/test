import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GitWorkspace, GitError } from '../core/git_workspace.js';
import { createGitRepo, createTempDir, git, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

function makeRepo() {
  return createGitRepo({
    'src/app.js': 'export const a = 1;\n',
    'src/old.js': 'export const old = true;\n',
    'docs/notes.md': '# notes\n',
    'storage/data.txt': 'runtime\n'
  });
}

describe('EvoCore Git Workspace (scoped, shell-free)', () => {

  after(cleanupTempDirs);

  it('lists only in-scope changes, including untracked files, with excludes applied', () => {
    const repo = makeRepo();
    writeFiles(repo, { 'src/app.js': 'export const a = 2;\n', 'src/new.js': 'new\n', 'docs/notes.md': 'changed\n', 'storage/data.txt': 'x\n' });
    fs.rmSync(path.join(repo, 'src/old.js'));

    const ws = new GitWorkspace({ repoDir: repo, scope: ['src', 'storage'], exclude: ['storage'] });
    const files = ws.changedFiles().map(f => f.path).sort();
    assert.deepEqual(files, ['src/app.js', 'src/new.js', 'src/old.js']);
  });

  it('includes untracked file contents in the diff so they are audited', () => {
    const repo = makeRepo();
    writeFiles(repo, { 'src/new.js': 'line one\nline two\n' });
    const diff = new GitWorkspace({ repoDir: repo, scope: ['src'] }).diff();
    assert.match(diff, /diff --git a\/src\/new\.js b\/src\/new\.js/);
    assert.match(diff, /\+line one\n\+line two/);
    assert.deepEqual(GitWorkspace.diffStats(diff), { added: 2, removed: 0, total: 2 });
  });

  it('commits exactly the given files and leaves unrelated staged work alone (regression: K4)', () => {
    const repo = makeRepo();
    writeFiles(repo, { 'src/app.js': 'export const a = 3;\n', 'docs/notes.md': 'user work in progress\n' });
    git(repo, 'add', 'docs/notes.md');

    const ws = new GitWorkspace({ repoDir: repo, scope: ['src'] });
    const files = ws.changedFiles();
    const hash = ws.commitFiles('evocore: scoped commit', files);

    assert.equal(git(repo, 'show', '--name-only', '--format=', hash), 'src/app.js');
    assert.match(git(repo, 'status', '--porcelain'), /^M {2}docs\/notes\.md$/m);
  });

  it('stores shell metacharacters in commit messages literally (regression: K2)', () => {
    const repo = makeRepo();
    writeFiles(repo, { 'src/app.js': 'export const a = 4;\n' });
    const ws = new GitWorkspace({ repoDir: repo, scope: ['src'] });
    const message = 'fix $(touch PWNED) `touch PWNED2` "quoted" \'single\'';
    ws.commitFiles(message, ws.changedFiles());

    assert.equal(git(repo, 'log', '-1', '--format=%s'), message);
    assert.equal(fs.existsSync(path.join(repo, 'PWNED')), false);
    assert.equal(fs.existsSync(path.join(repo, 'PWNED2')), false);
  });

  it('stashes in-scope changes recoverably and never touches out-of-scope files (regression: K3)', () => {
    const repo = makeRepo();
    writeFiles(repo, { 'src/app.js': 'export const a = 5;\n', 'src/new.js': 'candidate\n', 'my_unsaved_work.txt': 'important\n' });

    const ws = new GitWorkspace({ repoDir: repo, scope: ['src'] });
    const stashRef = ws.stashFiles('evocore-rollback: test', ws.changedFiles());

    assert.ok(stashRef);
    assert.equal(fs.readFileSync(path.join(repo, 'src/app.js'), 'utf8'), 'export const a = 1;\n');
    assert.equal(fs.existsSync(path.join(repo, 'src/new.js')), false);
    assert.equal(fs.readFileSync(path.join(repo, 'my_unsaved_work.txt'), 'utf8'), 'important\n');

    git(repo, 'stash', 'apply', stashRef);
    assert.equal(fs.readFileSync(path.join(repo, 'src/new.js'), 'utf8'), 'candidate\n');
  });

  it('works when the project lives in a subdirectory of the repository', () => {
    const repo = createGitRepo({ 'evo/src/a.js': '1\n', 'other/b.js': '1\n' });
    writeFiles(repo, { 'evo/src/a.js': '2\n', 'other/b.js': '2\n' });
    const ws = new GitWorkspace({ repoDir: path.join(repo, 'evo'), scope: ['.'] });
    const files = ws.changedFiles();
    assert.deepEqual(files.map(f => f.path), ['evo/src/a.js']);
    ws.commitFiles('subdir commit', files);
    assert.match(git(repo, 'status', '--porcelain'), /other\/b\.js/);
  });

  it('refuses to operate outside a git repository or on an empty one', () => {
    assert.throws(() => new GitWorkspace({ repoDir: createTempDir() }).assertReady(), GitError);
    const empty = createTempDir();
    git(empty, 'init', '-q');
    assert.throws(() => new GitWorkspace({ repoDir: empty }).assertReady(), /no commits/);
  });

});
