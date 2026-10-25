/**
 * EVO-CORE MUSE EPISODIC MEMORY & TRAJECTORY REFLECTION
 * Implements hierarchical retrospective memory using Node.js native DatabaseSync (SQLite).
 * Captures execution traces, extracts root causes, records winning fixes, and tracks Utility Scores.
 * Schema changes are applied through versioned migrations (PRAGMA user_version).
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { Gatekeeper, ACTIVE_UTILITY_THRESHOLD } from './gatekeeper.js';

export { ACTIVE_UTILITY_THRESHOLD };

const DatabaseSync = loadDatabaseSync();

/**
 * Loads node:sqlite while silencing only its "experimental feature" notice,
 * which would otherwise be printed on every CLI invocation.
 */
function loadDatabaseSync() {
  const require = createRequire(import.meta.url);
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function emitWarning(warning, ...args) {
    const type = typeof args[0] === 'string' ? args[0] : args[0]?.type;
    if (type === 'ExperimentalWarning' && /SQLite/i.test(String(warning?.message ?? warning))) return;
    return originalEmitWarning.call(process, warning, ...args);
  };
  try {
    return require('node:sqlite').DatabaseSync;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

const MAX_TEXT_BYTES = 64 * 1024;

const MIGRATIONS = [
  // v1: original EvoCore schema (idempotent so pre-versioned databases upgrade cleanly).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        signature TEXT NOT NULL UNIQUE,
        root_cause TEXT NOT NULL,
        failed_attempts TEXT,
        winning_fix TEXT NOT NULL,
        hits INTEGER DEFAULT 1,
        regressions INTEGER DEFAULT 0,
        total_uses INTEGER DEFAULT 1,
        utility_score REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trajectories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experience_id INTEGER,
        hypothesis TEXT NOT NULL,
        exit_code INTEGER NOT NULL,
        diff TEXT,
        stdout TEXT,
        stderr TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(experience_id) REFERENCES experiences(id)
      );

      CREATE INDEX IF NOT EXISTS idx_exp_domain ON experiences(domain);
      CREATE INDEX IF NOT EXISTS idx_exp_signature ON experiences(signature);
    `);
  },
  // v2: richer trajectories + persistent engine state (circuit breaker).
  (db) => {
    const columns = new Set(db.prepare('PRAGMA table_info(trajectories)').all().map(c => c.name));
    const add = (name, type) => {
      if (!columns.has(name)) db.exec(`ALTER TABLE trajectories ADD COLUMN ${name} ${type}`);
    };
    add('signature', 'TEXT');
    add('domain', 'TEXT');
    add('action', 'TEXT');
    add('score', 'REAL');
    add('duration_ms', 'INTEGER');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_traj_created ON trajectories(created_at);
      CREATE TABLE IF NOT EXISTS engine_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
];

function escapeLike(text) {
  return text.replace(/[\\%_]/g, ch => `\\${ch}`);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function truncate(text) {
  if (typeof text !== 'string') return null;
  const masked = Gatekeeper.maskSecrets(text);
  return masked.length > MAX_TEXT_BYTES ? `${masked.slice(0, MAX_TEXT_BYTES)}\n[... truncated ...]` : masked;
}

export class MUSEMemory {
  constructor(dbPath) {
    this.dbPath = dbPath || path.resolve(process.cwd(), 'storage', 'memory.sqlite');

    // Ensure parent directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.initTables();
  }

  /**
   * Applies pending schema migrations inside transactions.
   */
  initTables() {
    let version = this.db.prepare('PRAGMA user_version').get().user_version;
    while (version < MIGRATIONS.length) {
      this.db.exec('BEGIN');
      try {
        MIGRATIONS[version](this.db);
        version += 1;
        this.db.exec(`PRAGMA user_version = ${version}`);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  get schemaVersion() {
    return this.db.prepare('PRAGMA user_version').get().user_version;
  }

  /**
   * Normalises a signature exactly the same way for writes and lookups.
   */
  static normalizeSignature(signature) {
    const clean = Gatekeeper.maskSecrets(String(signature ?? '').trim()).slice(0, 200);
    return clean;
  }

  /**
   * Records a structured retrospective experience after a task execution.
   */
  recordExperience({
    domain = 'GENERAL',
    signature,
    rootCause,
    failedAttempts = [],
    winningFix
  }) {
    const cleanSignature = MUSEMemory.normalizeSignature(signature);
    if (!cleanSignature || !winningFix) {
      throw new Error('Signature and winningFix are required for MUSE memory.');
    }

    const hasRootCause = typeof rootCause === 'string' && rootCause.trim() !== '';
    const cleanRootCause = Gatekeeper.maskSecrets(hasRootCause ? rootCause : 'Root cause identified through trajectory analysis.');
    const cleanFix = Gatekeeper.maskSecrets(String(winningFix));
    const now = new Date().toISOString();

    // Check if signature already exists
    const existing = this.getExperience(cleanSignature);

    if (existing) {
      // Update existing experience (increment hits and update fix if needed)
      const newHits = existing.hits + 1;
      const newUses = existing.total_uses + 1;
      const newUtility = Gatekeeper.calculateUtilityScore(newHits, existing.regressions, newUses);

      this.db.prepare(`
        UPDATE experiences
        SET winning_fix = ?, root_cause = ?, hits = ?, total_uses = ?, utility_score = ?, updated_at = ?
        WHERE id = ?
      `).run(cleanFix, hasRootCause ? cleanRootCause : existing.root_cause, newHits, newUses, newUtility, now, existing.id);

      return {
        id: existing.id,
        action: 'UPDATED',
        signature: cleanSignature,
        utilityScore: newUtility
      };
    }

    // Insert new experience
    const result = this.db.prepare(`
      INSERT INTO experiences (domain, signature, root_cause, failed_attempts, winning_fix, hits, regressions, total_uses, utility_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, 1, 1.0, ?, ?)
    `).run(
      String(domain || 'GENERAL'),
      cleanSignature,
      cleanRootCause,
      JSON.stringify(Array.isArray(failedAttempts) ? failedAttempts.map(a => Gatekeeper.maskSecrets(String(a))) : []),
      cleanFix,
      now,
      now
    );

    return {
      id: Number(result.lastInsertRowid),
      action: 'CREATED',
      signature: cleanSignature,
      utilityScore: 1.0
    };
  }

  /**
   * Reports a regression on a previously recorded experience.
   * @returns {number|null} New utility score, or null when the signature is unknown
   */
  reportRegression(signature) {
    const exp = this.getExperience(MUSEMemory.normalizeSignature(signature));
    if (!exp) return null;

    const newRegressions = exp.regressions + 1;
    const newUses = exp.total_uses + 1;
    const newUtility = Gatekeeper.calculateUtilityScore(exp.hits, newRegressions, newUses);

    this.db.prepare(`
      UPDATE experiences
      SET regressions = ?, total_uses = ?, utility_score = ?, updated_at = ?
      WHERE id = ?
    `).run(newRegressions, newUses, newUtility, new Date().toISOString(), exp.id);
    return newUtility;
  }

  getExperience(signature) {
    const clean = MUSEMemory.normalizeSignature(signature);
    if (!clean) return null;
    return this.db.prepare('SELECT * FROM experiences WHERE signature = ?').get(clean) || null;
  }

  /**
   * Retrieves active, high-utility solutions matching a domain or keyword.
   * Keyword wildcards (%, _) are matched literally.
   */
  findRelevantExperiences(keyword = '', domain = null, { limit = 5, includeArchived = false } = {}) {
    let query = 'SELECT * FROM experiences WHERE 1 = 1';
    const params = [];

    if (!includeArchived) {
      query += ' AND utility_score >= ?';
      params.push(ACTIVE_UTILITY_THRESHOLD);
    }

    if (domain) {
      query += ' AND domain = ?';
      params.push(domain);
    }

    if (keyword) {
      query += " AND (signature LIKE ? ESCAPE '\\' OR root_cause LIKE ? ESCAPE '\\' OR winning_fix LIKE ? ESCAPE '\\')";
      const term = `%${escapeLike(String(keyword))}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY utility_score DESC, hits DESC, id ASC LIMIT ?';
    params.push(clampInt(limit, 1, 1000, 5));
    return this.db.prepare(query).all(...params);
  }

  /**
   * Counts experiences (all, or only active ones with utility >= 0.5).
   */
  countExperiences({ activeOnly = false } = {}) {
    const sql = activeOnly
      ? 'SELECT COUNT(*) AS n FROM experiences WHERE utility_score >= ?'
      : 'SELECT COUNT(*) AS n FROM experiences';
    const row = activeOnly ? this.db.prepare(sql).get(ACTIVE_UTILITY_THRESHOLD) : this.db.prepare(sql).get();
    return Number(row.n);
  }

  /**
   * Persists one executed ratchet trial (masked and size-limited).
   */
  recordTrajectory({
    signature = null,
    domain = null,
    hypothesis = '',
    action = null,
    exitCode = null,
    score = null,
    durationMs = null,
    diff = '',
    stdout = '',
    stderr = ''
  }) {
    const experience = signature ? this.getExperience(signature) : null;
    const result = this.db.prepare(`
      INSERT INTO trajectories (experience_id, hypothesis, exit_code, diff, stdout, stderr, created_at, signature, domain, action, score, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      experience ? experience.id : null,
      Gatekeeper.maskSecrets(String(hypothesis || 'N/A')).slice(0, 500),
      Number.isInteger(exitCode) ? exitCode : -1,
      truncate(diff),
      truncate(stdout),
      truncate(stderr),
      new Date().toISOString(),
      signature ? MUSEMemory.normalizeSignature(signature) : null,
      domain,
      action,
      Number.isFinite(score) ? score : null,
      Number.isFinite(durationMs) ? Math.round(durationMs) : null
    );
    return Number(result.lastInsertRowid);
  }

  /**
   * Most recent trajectories first (without the bulky diff/log columns unless requested).
   */
  listTrajectories({ limit = 50, withDetails = false } = {}) {
    const columns = withDetails
      ? '*'
      : 'id, experience_id, signature, domain, hypothesis, action, exit_code, score, duration_ms, created_at';
    return this.db.prepare(`SELECT ${columns} FROM trajectories ORDER BY id DESC LIMIT ?`).all(clampInt(limit, 1, 1000, 50));
  }

  countTrajectories() {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM trajectories').get().n);
  }

  /**
   * Small persistent key/value store for engine state (e.g. circuit breaker).
   */
  getState(key) {
    const row = this.db.prepare('SELECT value FROM engine_state WHERE key = ?').get(String(key));
    if (!row) return undefined;
    try {
      return JSON.parse(row.value);
    } catch {
      return undefined;
    }
  }

  setState(key, value) {
    this.db.prepare(`
      INSERT INTO engine_state (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(key), JSON.stringify(value), new Date().toISOString());
  }

  /**
   * Closes the SQLite connection cleanly.
   */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
