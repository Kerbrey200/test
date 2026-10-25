/**
 * EVO-CORE AUTOSKILL DISTILLER
 * Transforms verified episodic experiences into modular, versioned Skill.md files.
 * Enforces deduplication by name, semantic version bumping (v1.0.0 -> v1.1.0),
 * utility synchronisation with MUSE memory, and active skill injection.
 * Frontmatter values are serialised so user text can never inject keys.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Gatekeeper, ACTIVE_UTILITY_THRESHOLD } from './gatekeeper.js';

const MAX_SKILL_BYTES = 1024 * 1024;

// Uzbek and Russian Cyrillic -> Latin, so Cyrillic skill names keep readable file names.
const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'o',
  ф: 'f', х: 'x', ҳ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

function singleLine(text) {
  return String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function quote(text) {
  return JSON.stringify(singleLine(text));
}

function parseValue(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return value;
}

/**
 * Splits a Skill.md document into frontmatter data and body. Returns null when malformed.
 */
export function parseSkillDocument(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) data[line.slice(0, idx).trim()] = parseValue(line.slice(idx + 1));
  }
  return { data, body: content.slice(match[0].length).trim() };
}

function fenceFor(code) {
  const longestRun = Math.max(0, ...(code.match(/`+/g) || []).map(run => run.length));
  return '`'.repeat(Math.max(3, longestRun + 1));
}

function bumpMinor(version) {
  const parts = String(version || '').split('.').map(n => Number.parseInt(n, 10));
  if (parts.length < 2 || parts.some(n => !Number.isFinite(n) || n < 0)) return '1.1.0';
  return `${parts[0]}.${parts[1] + 1}.0`;
}

export class AutoSkillDistiller {
  constructor(skillsDir) {
    this.skillsDir = skillsDir || path.resolve(process.cwd(), 'skills');
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Generates a safe file slug from a signature name.
   * Accents are stripped, Cyrillic is transliterated, and names with no usable
   * characters fall back to a stable hash.
   */
  slugify(name) {
    const latin = String(name ?? '')
      .toLowerCase()
      .replace(/[а-яёғқўҳ]/g, ch => CYRILLIC[ch] ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '');
    const slug = latin
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80)
      .replace(/_+$/g, '');
    if (slug) return slug;
    return `skill_${crypto.createHash('sha1').update(String(name)).digest('hex').slice(0, 10)}`;
  }

  /**
   * Resolves the file for a skill name; a different skill already owning the
   * slug gets a hash-suffixed file instead of being overwritten.
   */
  resolveSkillFile(cleanName) {
    let slug = this.slugify(cleanName);
    let filePath = path.join(this.skillsDir, `${slug}.md`);
    const existing = this.readSkillFile(filePath);
    if (existing && existing.data.name && existing.data.name !== cleanName) {
      slug = `${slug}_${crypto.createHash('sha1').update(cleanName).digest('hex').slice(0, 8)}`;
      filePath = path.join(this.skillsDir, `${slug}.md`);
    }
    return { slug, filePath };
  }

  readSkillFile(filePath) {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) return null;
      return parseSkillDocument(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  writeAtomic(filePath, content) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  renderSkill({ name, description, domain, version, utilityScore, createdAt, updatedAt, tags, rootCause, rule, code }) {
    const fence = code ? fenceFor(code) : '';
    return [
      '---',
      `name: ${quote(name)}`,
      `description: ${quote(description)}`,
      `domain: ${quote(domain)}`,
      `version: ${version}`,
      `utility_score: ${utilityScore}`,
      `created_at: ${createdAt}`,
      `updated_at: ${updatedAt}`,
      `tags: [${tags.join(', ')}]`,
      '---',
      '',
      `# ${singleLine(name)}`,
      '',
      '## ⚠️ Muammo va Asosiy Sabab (Root Cause)',
      rootCause,
      '',
      '## 🛡️ Yechim Qoidasi (Actionable Rule)',
      rule,
      '',
      ...(code ? ['## 💻 Tekshirilgan Kod Namunasi (Verified Example)', fence, code, fence, ''] : [])
    ].join('\n');
  }

  /**
   * Distills a verified experience into a persistent Skill.md file.
   */
  distillSkill({
    name,
    description,
    domain = 'GENERAL',
    rootCause,
    rule,
    verifiedCode = '',
    utilityScore = 1.0,
    tags = []
  }) {
    if (!name || !String(name).trim() || !rule) {
      throw new Error('Skill distillation requires name and rule.');
    }

    const cleanName = singleLine(Gatekeeper.maskSecrets(String(name))).slice(0, 200);
    const cleanDesc = singleLine(Gatekeeper.maskSecrets(String(description || cleanName))).slice(0, 500);
    const cleanDomain = singleLine(domain || 'GENERAL').slice(0, 64) || 'GENERAL';
    const cleanRule = Gatekeeper.maskSecrets(String(rule));
    const cleanCode = Gatekeeper.maskSecrets(String(verifiedCode || '')).replace(/\s+$/, '');
    const cleanRootCause = Gatekeeper.maskSecrets(String(rootCause || 'Identified through empirical execution trace.'));
    const cleanTags = (tags.length > 0 ? tags : [cleanDomain])
      .map(tag => String(tag).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, ''))
      .filter(Boolean)
      .slice(0, 20);
    const utility = Number.isFinite(Number(utilityScore)) ? Number(utilityScore) : 1.0;

    const { slug, filePath } = this.resolveSkillFile(cleanName);
    const existing = this.readSkillFile(filePath);
    const now = new Date().toISOString();
    const version = existing ? bumpMinor(existing.data.version) : '1.0.0';

    this.writeAtomic(filePath, this.renderSkill({
      name: cleanName,
      description: cleanDesc,
      domain: cleanDomain,
      version,
      utilityScore: utility,
      createdAt: existing?.data.created_at || existing?.data.updated_at || now,
      updatedAt: now,
      tags: cleanTags,
      rootCause: cleanRootCause,
      rule: cleanRule,
      code: cleanCode
    }));

    return {
      filePath,
      slug,
      version,
      action: existing ? 'UPDATED' : 'CREATED',
      utilityScore: utility
    };
  }

  /**
   * Synchronises a skill's utility score with MUSE memory (e.g. after a regression).
   * Skills below the 0.5 threshold become inactive but are kept on disk.
   * @returns {{slug:string, filePath:string, utilityScore:number, active:boolean}|null}
   */
  updateUtility(name, utilityScore) {
    const cleanName = singleLine(Gatekeeper.maskSecrets(String(name ?? ''))).slice(0, 200);
    if (!cleanName || !Number.isFinite(Number(utilityScore))) return null;

    const { slug, filePath } = this.resolveSkillFile(cleanName);
    const existing = this.readSkillFile(filePath);
    if (!existing || existing.data.name !== cleanName) return null;

    // Rewrite only the frontmatter block; the body is left byte-for-byte intact.
    const raw = fs.readFileSync(filePath, 'utf8');
    const header = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const setKey = (block, key, value) => (new RegExp(`^${key}:.*$`, 'm').test(block)
      ? block.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`)
      : `${block}\n${key}: ${value}`);
    let block = setKey(header[1], 'utility_score', Number(utilityScore));
    block = setKey(block, 'updated_at', new Date().toISOString());
    this.writeAtomic(filePath, `---\n${block}\n---${raw.slice(header[0].length)}`);

    return { slug, filePath, utilityScore: Number(utilityScore), active: Number(utilityScore) >= ACTIVE_UTILITY_THRESHOLD };
  }

  /**
   * Reads every parseable skill (malformed or oversized files are skipped).
   */
  getAllSkills(domain = null) {
    if (!fs.existsSync(this.skillsDir)) return [];

    const skills = [];
    for (const file of fs.readdirSync(this.skillsDir).filter(f => f.endsWith('.md')).sort()) {
      const fullPath = path.join(this.skillsDir, file);
      const parsed = this.readSkillFile(fullPath);
      if (!parsed) continue;

      const utility = Number.parseFloat(parsed.data.utility_score ?? '1.0');
      const utilityScore = Number.isFinite(utility) ? utility : 0;
      if (domain && parsed.data.domain !== domain) continue;

      skills.push({
        file,
        path: fullPath,
        ...parsed.data,
        name: String(parsed.data.name || file.replace(/\.md$/, '')),
        version: String(parsed.data.version || '1.0.0'),
        utility_score: utilityScore,
        active: utilityScore >= ACTIVE_UTILITY_THRESHOLD,
        body: parsed.body
      });
    }

    return skills.sort((a, b) => b.utility_score - a.utility_score || a.name.localeCompare(b.name));
  }

  /**
   * Reads all active skills with utility score >= 0.5.
   */
  getActiveSkills(domain = null) {
    return this.getAllSkills(domain).filter(skill => skill.active);
  }
}
