/**
 * EVO-CORE CONFIGURATION LOADER
 * Reads the optional evocore.config.json from the project root, validates it
 * and merges it over safe defaults. Anything that can run a command (test
 * commands) or touch files (scope) is defined here, never by API callers.
 */

import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = 'evocore.config.json';

export const DEFAULT_CONFIG = Object.freeze({
  // Pathspecs (relative to the project root) the ratchet may evaluate, commit and roll back.
  scope: ['.'],
  // Pathspecs never touched by the ratchet. storage/ and skills/ are always added.
  exclude: ['node_modules'],
  // Allowlist of runnable test commands, addressed by id.
  testCommands: { default: 'npm test' },
  timeoutMs: 120000,
  maxOutputBytes: 1024 * 1024,
  maxConsecutiveFailures: 3,
  // true: a trial must beat the baseline; false: it must at least match it.
  strictImprovement: false,
  // Diffs above this size lose maintainability points on the scorecard.
  maxDiffLines: 800,
  promotionThreshold: 75,
  server: { host: '127.0.0.1', port: 3777 }
});

export class ConfigError extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertInteger(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`"${name}" must be an integer between ${min} and ${max}.`);
  }
}

function validatePathspecs(list, name, rootDir) {
  if (!Array.isArray(list) || list.some(p => typeof p !== 'string' || p.trim() === '')) {
    throw new ConfigError(`"${name}" must be an array of non-empty strings.`);
  }
  return list.map((entry) => {
    const trimmed = entry.trim();
    if (trimmed.includes('\0') || trimmed.startsWith(':') || trimmed.startsWith('-')) {
      throw new ConfigError(`"${name}" entry "${trimmed}" is not allowed (no pathspec magic or options).`);
    }
    const absolute = path.resolve(rootDir, trimmed);
    const relative = path.relative(rootDir, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ConfigError(`"${name}" entry "${trimmed}" points outside the project root.`);
    }
    return (relative || '.').split(path.sep).join('/');
  });
}

/**
 * Validates a merged configuration object and returns a normalised, frozen copy.
 */
export function validateConfig(config, rootDir) {
  const scope = validatePathspecs(config.scope, 'scope', rootDir);
  if (scope.length === 0) throw new ConfigError('"scope" must contain at least one path.');
  const exclude = validatePathspecs(config.exclude, 'exclude', rootDir);

  if (!isPlainObject(config.testCommands) || Object.keys(config.testCommands).length === 0) {
    throw new ConfigError('"testCommands" must be an object with at least one { id: command } entry.');
  }
  for (const [id, command] of Object.entries(config.testCommands)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(id)) throw new ConfigError(`Invalid test command id "${id}".`);
    if (typeof command !== 'string' || command.trim() === '') {
      throw new ConfigError(`Test command "${id}" must be a non-empty string.`);
    }
  }

  assertInteger(config.timeoutMs, 'timeoutMs', 1000, 3600000);
  assertInteger(config.maxOutputBytes, 'maxOutputBytes', 1024, 64 * 1024 * 1024);
  assertInteger(config.maxConsecutiveFailures, 'maxConsecutiveFailures', 1, 1000);
  assertInteger(config.maxDiffLines, 'maxDiffLines', 1, 1000000);
  if (typeof config.strictImprovement !== 'boolean') throw new ConfigError('"strictImprovement" must be a boolean.');
  if (typeof config.promotionThreshold !== 'number' || config.promotionThreshold < 0 || config.promotionThreshold > 100) {
    throw new ConfigError('"promotionThreshold" must be a number between 0 and 100.');
  }

  if (!isPlainObject(config.server)) throw new ConfigError('"server" must be an object.');
  if (typeof config.server.host !== 'string' || config.server.host.trim() === '') {
    throw new ConfigError('"server.host" must be a non-empty string.');
  }
  assertInteger(config.server.port, 'server.port', 0, 65535);

  return Object.freeze({
    ...config,
    scope: Object.freeze(scope),
    exclude: Object.freeze(exclude),
    testCommands: Object.freeze({ ...config.testCommands }),
    server: Object.freeze({ ...config.server })
  });
}

/**
 * Loads <rootDir>/evocore.config.json (if present) and merges it with defaults and overrides.
 * @param {string} rootDir Project root
 * @param {object} [overrides] Programmatic overrides (highest priority)
 */
export function loadConfig(rootDir, overrides = {}) {
  const root = path.resolve(rootDir);
  const filePath = path.join(root, CONFIG_FILE);
  let fileConfig = {};

  if (fs.existsSync(filePath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      throw new ConfigError(`Cannot parse ${CONFIG_FILE}: ${err.message}`);
    }
    if (!isPlainObject(fileConfig)) throw new ConfigError(`${CONFIG_FILE} must contain a JSON object.`);
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...overrides,
    server: { ...DEFAULT_CONFIG.server, ...(fileConfig.server || {}), ...(overrides.server || {}) }
  };

  return validateConfig(merged, root);
}
