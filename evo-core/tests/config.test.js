import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError, DEFAULT_CONFIG } from '../core/config.js';
import { createTempDir, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

describe('EvoCore Configuration Loader', () => {

  after(cleanupTempDirs);

  it('returns validated defaults when no config file exists', () => {
    const config = loadConfig(createTempDir());
    assert.deepEqual([...config.scope], ['.']);
    assert.equal(config.testCommands.default, DEFAULT_CONFIG.testCommands.default);
    assert.equal(config.server.host, '127.0.0.1');
    assert.ok(Object.isFrozen(config));
  });

  it('merges evocore.config.json and programmatic overrides', () => {
    const dir = createTempDir();
    writeFiles(dir, {
      'evocore.config.json': JSON.stringify({ scope: ['src', './lib/'], testCommands: { unit: 'npm run unit' }, server: { port: 4000 } })
    });
    const config = loadConfig(dir, { timeoutMs: 5000 });
    assert.deepEqual([...config.scope], ['src', 'lib']);
    assert.equal(config.testCommands.unit, 'npm run unit');
    assert.equal(config.server.port, 4000);
    assert.equal(config.server.host, '127.0.0.1');
    assert.equal(config.timeoutMs, 5000);
  });

  it('rejects scopes outside the project, pathspec magic and invalid values', () => {
    const dir = createTempDir();
    assert.throws(() => loadConfig(dir, { scope: ['../other'] }), ConfigError);
    assert.throws(() => loadConfig(dir, { scope: [':(top)'] }), ConfigError);
    assert.throws(() => loadConfig(dir, { scope: [] }), ConfigError);
    assert.throws(() => loadConfig(dir, { testCommands: {} }), ConfigError);
    assert.throws(() => loadConfig(dir, { timeoutMs: 5 }), ConfigError);
    assert.throws(() => loadConfig(dir, { server: { port: 70000 } }), ConfigError);
  });

  it('reports malformed JSON with a clear error', () => {
    const dir = createTempDir();
    writeFiles(dir, { 'evocore.config.json': '{ scope: oops' });
    assert.throws(() => loadConfig(dir), /Cannot parse evocore\.config\.json/);
  });

});
