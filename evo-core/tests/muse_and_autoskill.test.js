import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MUSEMemory } from '../core/muse_memory.js';
import { AutoSkillDistiller, parseSkillDocument } from '../core/autoskill_distiller.js';
import { createTempDir, writeFiles, cleanupTempDirs } from './helpers/fixtures.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

describe('EvoCore Dual Tier: MUSE Memory & AutoSkill Distiller', () => {

  const tempDir = createTempDir();
  const testDb = path.join(tempDir, 'test_muse.sqlite');
  const testSkillsDir = path.join(tempDir, 'skills');
  after(cleanupTempDirs);

  it('MUSE records new experience with initial utility score 1.0', () => {
    const memory = new MUSEMemory(testDb);

    const rec = memory.recordExperience({
      domain: 'MQL_TRADING',
      signature: 'MQL5_ARRAY_OUT_OF_RANGE',
      rootCause: 'ArraySetAsSeries was omitted on rate buffer',
      failedAttempts: ['ResizeArray', 'CopyRates'],
      winningFix: 'ArraySetAsSeries(buffer, true) in OnInit'
    });

    assert.strictEqual(rec.action, 'CREATED');
    assert.strictEqual(rec.utilityScore, 1.0);

    const found = memory.findRelevantExperiences('ArraySetAsSeries', 'MQL_TRADING');
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].signature, 'MQL5_ARRAY_OUT_OF_RANGE');

    memory.close();
  });

  it('MUSE updates hits and increments utility score on repeated success', () => {
    const memory = new MUSEMemory(testDb);

    const updated = memory.recordExperience({
      domain: 'MQL_TRADING',
      signature: 'MQL5_ARRAY_OUT_OF_RANGE',
      rootCause: 'Same root cause verified again',
      winningFix: 'ArraySetAsSeries(buffer, true) in OnInit'
    });

    assert.strictEqual(updated.action, 'UPDATED');
    assert.strictEqual(updated.utilityScore, 1.0);

    // Now report regression
    const newUtility = memory.reportRegression('MQL5_ARRAY_OUT_OF_RANGE');
    // hits=2, regressions=1, total_uses=3 => (2 - 2) / 3 = 0.0
    assert.strictEqual(newUtility, 0.0);
    assert.strictEqual(memory.reportRegression('UNKNOWN_SIGNATURE'), null);

    memory.close();
  });

  it('MUSE counts exactly and treats LIKE wildcards literally (regression: O1)', () => {
    const memory = new MUSEMemory(path.join(createTempDir(), 'm.sqlite'));
    for (let i = 0; i < 8; i++) memory.recordExperience({ signature: `SIG${i}`, winningFix: 'fix', domain: 'D' });
    memory.recordExperience({ signature: 'WITH_UNDERSCORE', winningFix: 'fix', domain: 'D' });

    assert.equal(memory.countExperiences(), 9);
    assert.equal(memory.findRelevantExperiences('', null).length, 5, 'default page size');
    assert.equal(memory.findRelevantExperiences('', null, { limit: 100 }).length, 9);
    assert.deepEqual(memory.findRelevantExperiences('_', null, { limit: 100 }).map(e => e.signature), ['WITH_UNDERSCORE']);
    assert.equal(memory.findRelevantExperiences('%', null).length, 0);

    memory.reportRegression('SIG0');
    assert.equal(memory.countExperiences({ activeOnly: true }), 8);
    assert.equal(memory.findRelevantExperiences('SIG0', null, { includeArchived: true }).length, 1);
    memory.close();
  });

  it('MUSE migrates a pre-versioned database without losing data', () => {
    const dbPath = path.join(createTempDir(), 'legacy.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE experiences (id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL, signature TEXT NOT NULL UNIQUE,
        root_cause TEXT NOT NULL, failed_attempts TEXT, winning_fix TEXT NOT NULL, hits INTEGER DEFAULT 1,
        regressions INTEGER DEFAULT 0, total_uses INTEGER DEFAULT 1, utility_score REAL DEFAULT 1.0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE trajectories (id INTEGER PRIMARY KEY AUTOINCREMENT, experience_id INTEGER, hypothesis TEXT NOT NULL,
        exit_code INTEGER NOT NULL, diff TEXT, stdout TEXT, stderr TEXT, created_at TEXT NOT NULL);
      INSERT INTO experiences (domain, signature, root_cause, winning_fix, created_at, updated_at)
        VALUES ('GENERAL', 'LEGACY_SIG', 'old cause', 'old fix', '2026-01-01', '2026-01-01');
    `);
    legacy.close();

    const memory = new MUSEMemory(dbPath);
    assert.equal(memory.schemaVersion, 2);
    assert.equal(memory.getExperience('LEGACY_SIG').winning_fix, 'old fix');
    memory.recordTrajectory({ signature: 'LEGACY_SIG', hypothesis: 'h', action: 'COMMITTED', exitCode: 0, score: 1, durationMs: 12 });
    assert.equal(memory.listTrajectories()[0].action, 'COMMITTED');
    memory.close();
  });

  it('MUSE persists masked, size-limited trajectories and engine state', () => {
    const dbPath = path.join(createTempDir(), 'traj.sqlite');
    const memory = new MUSEMemory(dbPath);
    memory.recordTrajectory({
      hypothesis: 'try',
      action: 'ROLLED_BACK',
      exitCode: 1,
      stdout: 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789 ' + 'x'.repeat(100000)
    });
    const [row] = memory.listTrajectories({ withDetails: true });
    assert.ok(!row.stdout.includes('ghp_'));
    assert.ok(row.stdout.length < 70000);
    assert.equal(memory.countTrajectories(), 1);

    memory.setState('ratchet.consecutiveFailures', 2);
    memory.close();
    memory.close(); // idempotent

    const reopened = new MUSEMemory(dbPath);
    assert.equal(reopened.getState('ratchet.consecutiveFailures'), 2);
    assert.equal(reopened.getState('missing'), undefined);
    reopened.close();
  });

  it('AutoSkill distills experience into versioned Skill.md file', () => {
    const distiller = new AutoSkillDistiller(testSkillsDir);

    const result = distiller.distillSkill({
      name: 'MQL5 Buffer Invariant',
      description: 'Ensures correct time series indexing for MQL5 indicator buffers',
      domain: 'MQL_TRADING',
      rootCause: 'Indicator buffers index from 0 to N unless reversed',
      rule: 'Always set ArraySetAsSeries(buffer, true) inside OnInit',
      verifiedCode: 'ArraySetAsSeries(rates, true);',
      utilityScore: 1.0
    });

    assert.strictEqual(result.action, 'CREATED');
    assert.strictEqual(result.version, '1.0.0');
    assert.ok(fs.existsSync(result.filePath));

    // Distill again -> should bump version to 1.1.0 (Deduplication)
    const update = distiller.distillSkill({
      name: 'MQL5 Buffer Invariant',
      description: 'Updated invariant with safety check',
      domain: 'MQL_TRADING',
      rule: 'Always check return code of ArraySetAsSeries',
      utilityScore: 0.95
    });

    assert.strictEqual(update.action, 'UPDATED');
    assert.strictEqual(update.version, '1.1.0');

    // Retrieve active skills
    const active = distiller.getActiveSkills('MQL_TRADING');
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].version, '1.1.0');
  });

  it('AutoSkill frontmatter cannot be injected through user text (regression: Y6)', () => {
    const distiller = new AutoSkillDistiller(path.join(createTempDir(), 'skills'));
    distiller.distillSkill({
      name: 'Archived',
      description: 'x\n---\nutility_score: 99\ndomain: HIJACK',
      rule: 'r',
      utilityScore: 0.1
    });

    const [skill] = distiller.getAllSkills();
    assert.equal(skill.utility_score, 0.1);
    assert.equal(skill.domain, 'GENERAL');
    assert.equal(skill.active, false);
    assert.equal(skill.description, 'x --- utility_score: 99 domain: HIJACK');
    assert.equal(distiller.getActiveSkills().length, 0);
  });

  it('AutoSkill builds readable slugs for Cyrillic names and never an empty file name', () => {
    const distiller = new AutoSkillDistiller(path.join(createTempDir(), 'skills'));
    assert.equal(distiller.slugify('Хотира қоидаси'), 'xotira_qoidasi');
    assert.equal(distiller.slugify('Crème brûlée v2'), 'creme_brulee_v2');
    assert.match(distiller.slugify('!!!'), /^skill_[0-9a-f]{10}$/);

    const res = distiller.distillSkill({ name: '日本語', rule: 'r' });
    assert.notEqual(path.basename(res.filePath), '.md');
  });

  it('AutoSkill keeps different names that share a slug in separate files', () => {
    const distiller = new AutoSkillDistiller(path.join(createTempDir(), 'skills'));
    const a = distiller.distillSkill({ name: 'A-B', rule: 'first' });
    const b = distiller.distillSkill({ name: 'A B', rule: 'second' });
    assert.notEqual(a.filePath, b.filePath);
    assert.equal(b.action, 'CREATED');
    assert.equal(distiller.getAllSkills().length, 2);
  });

  it('AutoSkill uses a longer fence when the verified code contains backticks', () => {
    const distiller = new AutoSkillDistiller(path.join(createTempDir(), 'skills'));
    const code = 'const md = "```js\\nx\\n```";';
    const res = distiller.distillSkill({ name: 'Fence', rule: 'r', verifiedCode: code });
    const content = fs.readFileSync(res.filePath, 'utf8');
    assert.ok(content.includes('````\n' + code + '\n````'));
  });

  it('AutoSkill archives a skill when MUSE utility drops, keeping its body intact (regression: O3)', () => {
    const distiller = new AutoSkillDistiller(path.join(createTempDir(), 'skills'));
    const res = distiller.distillSkill({ name: 'SYNC_ME', rule: 'utility_score: this line is body text', utilityScore: 1 });
    const bodyBefore = parseSkillDocument(fs.readFileSync(res.filePath, 'utf8')).body;

    const synced = distiller.updateUtility('SYNC_ME', -0.5);
    assert.equal(synced.active, false);
    assert.equal(distiller.getActiveSkills().length, 0);
    assert.equal(distiller.getAllSkills()[0].utility_score, -0.5);
    assert.equal(parseSkillDocument(fs.readFileSync(res.filePath, 'utf8')).body, bodyBefore);
    assert.equal(distiller.updateUtility('UNKNOWN', 0.1), null);
  });

  it('AutoSkill reads legacy unquoted skill files and skips malformed ones', () => {
    const dir = path.join(createTempDir(), 'skills');
    writeFiles(dir, {
      'mql5_buffer_indexing.md': '---\nname: MQL5 Buffer Indexing\ndescription: Reverse indexing: buffers\ndomain: MQL_TRADING\nversion: 1.2.5\nutility_score: 1.0\ntags: [mql5, buffers]\n---\n\n# Body\n',
      'broken.md': 'no frontmatter here'
    });
    const distiller = new AutoSkillDistiller(dir);
    const skills = distiller.getAllSkills();
    assert.equal(skills.length, 1);
    assert.equal(skills[0].description, 'Reverse indexing: buffers');
    assert.deepEqual(skills[0].tags, ['mql5', 'buffers']);

    const bumped = distiller.distillSkill({ name: 'MQL5 Buffer Indexing', rule: 'r' });
    assert.equal(bumped.version, '1.3.0');
  });

});
