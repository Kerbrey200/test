/**
 * EVO-CORE MUSE EPISODIC MEMORY & TRAJECTORY REFLECTION
 * Implements hierarchical retrospective memory using Node.js native DatabaseSync (SQLite).
 * Captures execution traces, extracts root causes, records winning fixes, and tracks Utility Scores.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Gatekeeper } from './gatekeeper.js';

export class MUSEMemory {
  constructor(dbPath) {
    this.dbPath = dbPath || path.resolve(process.cwd(), 'storage', 'memory.sqlite');
    
    // Ensure parent directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initTables();
  }

  /**
   * Initializes the persistent SQLite schema.
   */
  initTables() {
    this.db.exec(`
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
    if (!signature || !winningFix) {
      throw new Error('Signature and winningFix are required for MUSE memory.');
    }

    const cleanSignature = Gatekeeper.maskSecrets(signature);
    const cleanRootCause = Gatekeeper.maskSecrets(rootCause || 'Root cause identified through trajectory analysis.');
    const cleanFix = Gatekeeper.maskSecrets(winningFix);
    const now = new Date().toISOString();

    // Check if signature already exists
    const selectStmt = this.db.prepare('SELECT * FROM experiences WHERE signature = ?');
    const existing = selectStmt.get(cleanSignature);

    if (existing) {
      // Update existing experience (increment hits and update fix if needed)
      const newHits = existing.hits + 1;
      const newUses = existing.total_uses + 1;
      const newUtility = Gatekeeper.calculateUtilityScore(newHits, existing.regressions, newUses);

      const updateStmt = this.db.prepare(`
        UPDATE experiences 
        SET winning_fix = ?, hits = ?, total_uses = ?, utility_score = ?, updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(cleanFix, newHits, newUses, newUtility, now, existing.id);

      return {
        id: existing.id,
        action: 'UPDATED',
        signature: cleanSignature,
        utilityScore: newUtility
      };
    } else {
      // Insert new experience
      const insertStmt = this.db.prepare(`
        INSERT INTO experiences (domain, signature, root_cause, failed_attempts, winning_fix, hits, regressions, total_uses, utility_score, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 0, 1, 1.0, ?, ?)
      `);

      const result = insertStmt.run(
        domain,
        cleanSignature,
        cleanRootCause,
        JSON.stringify(failedAttempts),
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
  }

  /**
   * Reports a regression on a previously recorded experience.
   */
  reportRegression(signature) {
    const selectStmt = this.db.prepare('SELECT * FROM experiences WHERE signature = ?');
    const exp = selectStmt.get(signature);

    if (exp) {
      const newRegressions = exp.regressions + 1;
      const newUses = exp.total_uses + 1;
      const newUtility = Gatekeeper.calculateUtilityScore(exp.hits, newRegressions, newUses);

      const updateStmt = this.db.prepare(`
        UPDATE experiences 
        SET regressions = ?, total_uses = ?, utility_score = ?, updated_at = ?
        WHERE id = ?
      `);
      updateStmt.run(newRegressions, newUses, newUtility, new Date().toISOString(), exp.id);
      return newUtility;
    }
    return 0.0;
  }

  /**
   * Retrieves active, high-utility solutions matching a domain or keyword.
   */
  findRelevantExperiences(keyword = '', domain = null) {
    let query = 'SELECT * FROM experiences WHERE utility_score >= 0.5';
    const params = [];

    if (domain) {
      query += ' AND domain = ?';
      params.push(domain);
    }

    if (keyword) {
      query += ' AND (signature LIKE ? OR root_cause LIKE ? OR winning_fix LIKE ?)';
      const term = `%${keyword}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY utility_score DESC, hits DESC LIMIT 5';
    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Closes the SQLite connection cleanly.
   */
  close() {
    this.db.close();
  }
}
