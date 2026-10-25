#!/usr/bin/env node
/**
 * EVO-CORE COMPLETE CLI
 * Commands:
 *   status           - Displays engine statistics and health
 *   skills           - Lists all active AutoSkill modules
 *   memory           - Displays MUSE episodic memory experiences
 *   scan <file>      - Performs AST structural scan on JS/PY/MQL file
 *   audit <file>     - Runs MQL trading validator on MQL4/MQL5 file
 *   dashboard        - Generates interactive offline HTML visual report
 */

import path from 'node:path';
import fs from 'node:fs';
import { EvoCore, ASTScanner, MQLValidator, DashboardGenerator } from '../core/index.js';

const args = process.argv.slice(2);
const command = args[0] || 'status';
const targetArg = args[1] || '';

const evo = new EvoCore({ rootDir: process.cwd() });

console.log('\n' + '='.repeat(85));
console.log('🏛️  EVO-CORE: TRI-CORE AUTONOMOUS EVOLUTION ENGINE (v1.0.0 ZERO-FAT)');
console.log('='.repeat(85));

try {
  if (command === 'status') {
    const status = evo.getStatus();
    console.log(`\n⚙️  Dvigatel Holati: ACTIVE (ZERO-FAT)`);
    console.log(`📚 Faol Ko'nikmalar (AutoSkill): ${status.activeSkillsCount}`);
    console.log(`🧠 Saqlangan Tajribalar (MUSE): ${status.experiencesCount}`);
    console.log(`🔄 Bajarilgan Sinovlar (Ratchet): ${status.historyCount}`);
    console.log(`🛡️  Circuit Breaker Xatoliklar: ${status.circuitBreakerFailures} / 3`);
    console.log('\n✔ Tizim to\'liq ishchi holatda.\n');

  } else if (command === 'skills') {
    const skills = evo.skills.getActiveSkills();
    console.log(`\n📚 FAOL KO'NIKMALAR RO'YXATI (${skills.length} ta):\n`);
    if (skills.length === 0) {
      console.log('  * Hozircha saqlangan ko\'nikmalar mavjud emas.');
    } else {
      for (const s of skills) {
        console.log(`  - \x1b[32m\x1b[1m${s.name}\x1b[0m (v${s.version}) | Domain: \x1b[36m${s.domain}\x1b[0m | Utility: \x1b[33m${s.utility_score}\x1b[0m`);
        console.log(`    Tavsif: ${s.description}`);
      }
    }
    console.log();

  } else if (command === 'memory') {
    const exp = evo.memory.findRelevantExperiences('', null);
    console.log(`\n🧠 MUSE TAJRIBALAR BAZASI (${exp.length} ta):\n`);
    if (exp.length === 0) {
      console.log('  * Hozircha saqlangan tajribalar mavjud emas.');
    } else {
      for (const e of exp) {
        console.log(`  - \x1b[34m[${e.domain}]\x1b[0m \x1b[1m${e.signature}\x1b[0m (Utility: ${e.utility_score}, Hits: ${e.hits}, Regr: ${e.regressions})`);
        console.log(`    Ildiz Sabab: ${e.root_cause}`);
        console.log(`    Yechim: ${e.winning_fix}`);
      }
    }
    console.log();

  } else if (command === 'scan') {
    if (!targetArg) {
      console.log('\n❌ Xatolik: Fayl ko\'rsatilmadi. Masalan: node bin/evocore.js scan path/to/file.mq5\n');
    } else {
      console.log(`\n🔍 AST STRUKTURA SKANERI: "${targetArg}"\n`);
      const scan = ASTScanner.scanFile(targetArg);
      console.log(`- Format: ${scan.ext} (${scan.lineCount} qator)`);
      console.log(`- Funksiyalar soni: ${scan.functions.length}`);
      for (const f of scan.functions) {
        console.log(`  * fn: ${f.name}(${f.params.join(', ')})`);
      }
      console.log(`- Klasslar soni: ${scan.classes.length}`);
      console.log(`- Importlar: ${scan.imports.join(', ') || 'yo\'q'}`);
      console.log(`- Exportlar: ${scan.exports.join(', ') || 'yo\'q'}\n`);
    }

  } else if (command === 'audit') {
    if (!targetArg) {
      console.log('\n❌ Xatolik: MQL fayl ko\'rsatilmadi. Masalan: node bin/evocore.js audit path/to/file.mq5\n');
    } else {
      console.log(`\n🛡️ MQL TRADING AUDITORI: "${targetArg}"\n`);
      const code = fs.readFileSync(targetArg, 'utf8');
      const audit = MQLValidator.auditMQL(code);

      console.log(`- Holat: ${audit.passed ? '\x1b[32mPASSED (Muammosiz)\x1b[0m' : '\x1b[31mFAILED (Xatolar Bor)\x1b[0m'}`);
      console.log(`- Jami muammolar: ${audit.totalIssues} (Kritik: ${audit.criticalCount}, Ogohlantirish: ${audit.warningCount})\n`);

      for (const iss of audit.issues) {
        const color = iss.severity === 'CRITICAL' ? '\x1b[31m' : '\x1b[33m';
        console.log(`  ${color}[${iss.severity}] ${iss.id}: ${iss.title}\x1b[0m`);
        console.log(`    Tavsif: ${iss.description}`);
        console.log(`    Tavsiya: \x1b[32m${iss.recommendedFix}\x1b[0m\n`);
      }
    }

  } else if (command === 'dashboard') {
    const outPath = DashboardGenerator.generateHTML(evo);
    console.log(`\n✔ Interaktiv vizual dashboard yaratildi:`);
    console.log(`  📂 Fayl: \x1b[36m${outPath}\x1b[0m`);
    console.log(`  💡 Brauzeringizda ochib ko'rishingiz mumkin!\n`);

  } else {
    console.log(`\nNoma'lum buyruq: "${command}".`);
    console.log(`Mavjud buyruqlar:`);
    console.log(`  status            - Tizim statistikasi`);
    console.log(`  skills            - Faol AutoSkill modullari`);
    console.log(`  memory            - MUSE tajribalari`);
    console.log(`  scan <fayl>       - Faylning AST tahlili`);
    console.log(`  audit <mql_fayl>  - MQL4/MQL5 savdo kodi auditi`);
    console.log(`  dashboard         - Interaktiv HTML hisobot yaratish\n`);
  }
} finally {
  evo.close();
}
