/**
 * EVO-CORE AUTOSKILL DISTILLER
 * Transforms verified episodic experiences into modular, versioned Skill.md files.
 * Enforces semantic deduplication, version bumping (v1.0.0 -> v1.1.0), and active skill injection.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Gatekeeper } from './gatekeeper.js';

export class AutoSkillDistiller {
  constructor(skillsDir) {
    this.skillsDir = skillsDir || path.resolve(process.cwd(), 'skills');
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Generates a safe file slug from a signature name.
   */
  slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
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
    if (!name || !rule) {
      throw new Error('Skill distillation requires name and rule.');
    }

    const cleanName = Gatekeeper.maskSecrets(name);
    const cleanDesc = Gatekeeper.maskSecrets(description || cleanName);
    const cleanRule = Gatekeeper.maskSecrets(rule);
    const cleanCode = Gatekeeper.maskSecrets(verifiedCode);
    const cleanRootCause = Gatekeeper.maskSecrets(rootCause || 'Identified through empirical execution trace.');

    const slug = this.slugify(cleanName);
    const filePath = path.join(this.skillsDir, `${slug}.md`);

    let version = '1.0.0';
    let isUpdate = false;

    if (fs.existsSync(filePath)) {
      isUpdate = true;
      const existingContent = fs.readFileSync(filePath, 'utf8');
      const verMatch = existingContent.match(/version:\s*([0-9\.]+)/);
      if (verMatch) {
        const parts = verMatch[1].split('.').map(Number);
        parts[1] = (parts[1] || 0) + 1; // Bump minor version
        version = parts.join('.');
      }
    }

    const now = new Date().toISOString();
    const cleanTags = tags.length > 0 ? tags : [domain.toLowerCase()];

    const markdown = [
      '---',
      `name: ${cleanName}`,
      `description: ${cleanDesc}`,
      `domain: ${domain}`,
      `version: ${version}`,
      `utility_score: ${utilityScore}`,
      `updated_at: ${now}`,
      `tags: [${cleanTags.join(', ')}]`,
      '---',
      '',
      `# ${cleanName}`,
      '',
      '## ⚠️ Muammo va Asosiy Sabab (Root Cause)',
      cleanRootCause,
      '',
      '## 🛡️ Yechim Qoidasi (Actionable Rule)',
      cleanRule,
      '',
      cleanCode ? ['## 💻 Tekshirilgan Kod Namunasi (Verified Example)', '```', cleanCode, '```'].join('\n') : '',
      ''
    ].filter(Boolean).join('\n');

    fs.writeFileSync(filePath, markdown, 'utf8');

    return {
      filePath,
      slug,
      version,
      action: isUpdate ? 'UPDATED' : 'CREATED',
      utilityScore
    };
  }

  /**
   * Reads all active skills with utility score >= 0.5.
   */
  getActiveSkills(domain = null) {
    if (!fs.existsSync(this.skillsDir)) return [];

    const files = fs.readdirSync(this.skillsDir).filter(f => f.endsWith('.md'));
    const skills = [];

    for (const file of files) {
      const fullPath = path.join(this.skillsDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Parse YAML frontmatter
      const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (match) {
        const frontmatter = {};
        const lines = match[1].split('\n');
        for (const line of lines) {
          const idx = line.indexOf(':');
          if (idx > -1) {
            const key = line.slice(0, idx).trim();
            const val = line.slice(idx + 1).trim();
            frontmatter[key] = val;
          }
        }

        const utility = parseFloat(frontmatter.utility_score || '1.0');
        if (utility >= 0.5) {
          if (!domain || frontmatter.domain === domain) {
            skills.push({
              file,
              path: fullPath,
              ...frontmatter,
              body: content.replace(match[0], '').trim()
            });
          }
        }
      }
    }

    return skills.sort((a, b) => parseFloat(b.utility_score || 0) - parseFloat(a.utility_score || 0));
  }
}
