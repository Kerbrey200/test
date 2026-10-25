#!/usr/bin/env node
/**
 * EVO-CORE COMPLETE CLI
 * Commands:
 *   status                 - Engine statistics and health
 *   skills [--all]         - AutoSkill modules (active, or all incl. archived)
 *   memory [query] [--all] - MUSE episodic memory experiences
 *   history                - Persisted ratchet trials
 *   scan <file>            - AST structural scan on JS/TS/PY/MQL file
 *   audit <file>           - MQL4/MQL5 trading code audit (exit 2 on critical issues)
 *   trial                  - Run one ratchet trial on the current in-scope changes
 *   rollback               - Stash in-scope changes (recoverable with git stash apply)
 *   reset-breaker          - Close the circuit breaker after reviewing failures
 *   dashboard [--out f]    - Offline HTML visual report
 *
 * Exit codes: 0 success, 1 usage/runtime error, 2 negative verdict (audit failed,
 * trial not promoted).
 */

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { VERSION } from '../core/version.js';

const HELP = `
EvoCore v${VERSION} — Tri-Core Autonomous Evolution Engine

Foydalanish: evocore <buyruq> [parametrlar]

Buyruqlar:
  status                         Tizim statistikasi
  skills [--all] [--domain D]    AutoSkill modullari (--all: arxivlanganlar ham)
  memory [so'z] [--all]          MUSE tajribalari (qidiruv)
  history [--limit N]            Ratchet sinovlari tarixi
  scan <fayl>                    Faylning AST tahlili (JS/TS/PY/MQL)
  audit <mql_fayl>               MQL4/MQL5 savdo kodi auditi (kritik xatoda exit 2)
  trial --test "<buyruq>"        Joriy o'zgarishlar ustida bitta ratchet sinovi
        [--test-id ID] [--hypothesis H] [--title T] [--domain D] [--signature S]
        [--rule R] [--root-cause C] [--code K] [--baseline N] [--timeout MS]
  evolve --file F --instruction "<ko'rsatma>"  Avtonom LLM sikli (nomzod -> ratchet -> feedback)
        [--test "<buyruq>" | --test-id ID] [--iterations 3] [--provider mock|openai|anthropic|gemini]
        [--model M] [--signature S] [--rule R] [--domain D] [--metric "score=([0-9.]+)"] [--baseline N]
  rollback                       Scope ichidagi o'zgarishlarni git stash'ga olish
  reset-breaker                  Circuit breaker'ni qayta tiklash
  dashboard [--out fayl]         Offline HTML hisobot yaratish

Umumiy parametrlar:
  --json        Natijani JSON ko'rinishida chiqarish
  -h, --help    Yordam
  -v, --version Versiya

Exit kodlar: 0 — muvaffaqiyat, 1 — xatolik, 2 — salbiy natija (audit/sinov o'tmadi).
`;

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (COLOR ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const green = t => paint('32', t);
const red = t => paint('31', t);
const yellow = t => paint('33', t);
const cyan = t => paint('36', t);
const bold = t => paint('1', t);

class UsageError extends Error {}

function parse(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        all: { type: 'boolean' },
        domain: { type: 'string' },
        limit: { type: 'string' },
        out: { type: 'string' },
        test: { type: 'string' },
        'test-id': { type: 'string' },
        hypothesis: { type: 'string' },
        title: { type: 'string' },
        signature: { type: 'string' },
        rule: { type: 'string' },
        'root-cause': { type: 'string' },
        code: { type: 'string' },
        baseline: { type: 'string' },
        timeout: { type: 'string' },
        file: { type: 'string' },
        instruction: { type: 'string' },
        iterations: { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' },
        metric: { type: 'string' }
      }
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
}

function toInt(value, name, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`--${name} musbat butun son bo'lishi kerak.`);
  return n;
}

function banner(json) {
  if (json) return;
  console.log('\n' + '='.repeat(85));
  console.log(`🏛️  EVO-CORE: TRI-CORE AUTONOMOUS EVOLUTION ENGINE (v${VERSION} ZERO-FAT)`);
  console.log('='.repeat(85));
}

async function withEvo(fn) {
  const { EvoCore } = await import('../core/evocore.js');
  const evo = new EvoCore({ rootDir: process.cwd() });
  try {
    return await fn(evo);
  } finally {
    evo.close();
  }
}

function output(json, data, render) {
  if (json) console.log(JSON.stringify(data, null, 2));
  else render(data);
}

const commands = {
  async status({ values }) {
    return withEvo((evo) => {
      output(values.json, evo.getStatus(), (s) => {
        console.log(`\n⚙️  Dvigatel: ${s.engine}`);
        console.log(`📚 Faol Ko'nikmalar (AutoSkill): ${s.activeSkillsCount} (jami ${s.totalSkillsCount})`);
        console.log(`🧠 Saqlangan Tajribalar (MUSE): ${s.activeExperiencesCount} faol / ${s.experiencesCount} jami`);
        console.log(`🔄 Bajarilgan Sinovlar (Ratchet): ${s.historyCount}`);
        console.log(`🛡️  Circuit Breaker: ${s.circuitBreakerFailures} / ${s.maxConsecutiveFailures}${s.circuitOpen ? red(' (OCHIQ — sinovlar bloklangan, `evocore reset-breaker`)') : ''}`);
        console.log(s.circuitOpen ? `\n${yellow('⚠ Tizim ishlaydi, lekin yangi sinovlar bloklangan.')}\n` : `\n${green('✔ Tizim to\'liq ishchi holatda.')}\n`);
      });
      return 0;
    });
  },

  async skills({ values }) {
    return withEvo((evo) => {
      const skills = values.all ? evo.skills.getAllSkills(values.domain || null) : evo.skills.getActiveSkills(values.domain || null);
      output(values.json, skills.map(({ body, path, ...s }) => s), (list) => {
        console.log(`\n📚 ${values.all ? 'BARCHA' : 'FAOL'} KO'NIKMALAR (${list.length} ta):\n`);
        if (list.length === 0) console.log('  * Hozircha saqlangan ko\'nikmalar mavjud emas.');
        for (const s of list) {
          console.log(`  - ${green(bold(s.name))} (v${s.version}) | Domain: ${cyan(s.domain)} | Utility: ${yellow(s.utility_score)}${s.active ? '' : red(' [ARXIV]')}`);
          console.log(`    Tavsif: ${s.description}`);
        }
        console.log();
      });
      return 0;
    });
  },

  async memory({ values, positionals }) {
    return withEvo((evo) => {
      const keyword = positionals.slice(1).join(' ');
      const rows = evo.memory.findRelevantExperiences(keyword, values.domain || null, {
        limit: toInt(values.limit, 'limit', 50),
        includeArchived: Boolean(values.all)
      });
      output(values.json, rows, (list) => {
        console.log(`\n🧠 MUSE TAJRIBALAR BAZASI (${list.length} ta${keyword ? `, qidiruv: "${keyword}"` : ''}):\n`);
        if (list.length === 0) console.log('  * Tajribalar topilmadi.');
        for (const e of list) {
          console.log(`  - ${cyan(`[${e.domain}]`)} ${bold(e.signature)} (Utility: ${e.utility_score}, Hits: ${e.hits}, Regr: ${e.regressions})`);
          console.log(`    Ildiz Sabab: ${e.root_cause}`);
          console.log(`    Yechim: ${e.winning_fix}`);
        }
        console.log();
      });
      return 0;
    });
  },

  async history({ values }) {
    return withEvo((evo) => {
      const rows = evo.memory.listTrajectories({ limit: toInt(values.limit, 'limit', 20) });
      output(values.json, rows, (list) => {
        console.log(`\n🕘 RATCHET SINOVLARI TARIXI (${list.length} ta):\n`);
        if (list.length === 0) console.log('  * Hali sinovlar o\'tkazilmagan.');
        for (const t of list) {
          const action = t.action === 'COMMITTED' ? green(t.action) : red(t.action);
          console.log(`  - ${t.created_at} ${action} | exit ${t.exit_code === -1 ? '—' : t.exit_code} | ${t.hypothesis}${t.signature ? ` [${t.signature}]` : ''}`);
        }
        console.log();
      });
      return 0;
    });
  },

  async scan({ values, positionals }) {
    const target = positionals[1];
    if (!target) throw new UsageError('Fayl ko\'rsatilmadi. Masalan: evocore scan path/to/file.mq5');
    const { ASTScanner } = await import('../core/ast_scanner.js');
    const scan = ASTScanner.scanFile(target);
    output(values.json, scan, (s) => {
      console.log(`\n🔍 AST STRUKTURA SKANERI: "${target}"\n`);
      console.log(`- Format: ${s.ext} (${s.lineCount} qator)`);
      console.log(`- Funksiyalar soni: ${s.functions.length}`);
      for (const f of s.functions) console.log(`  * ${String(f.line).padStart(4)}: ${f.name}(${f.params.join(', ')})`);
      console.log(`- Klasslar: ${s.classes.map(c => (c.extends ? `${c.name} extends ${c.extends}` : c.name)).join(', ') || 'yo\'q'}`);
      console.log(`- Importlar: ${s.imports.join(', ') || 'yo\'q'}`);
      console.log(`- Exportlar: ${s.exports.join(', ') || 'yo\'q'}\n`);
    });
    return 0;
  },

  async audit({ values, positionals }) {
    const target = positionals[1];
    if (!target) throw new UsageError('MQL fayl ko\'rsatilmadi. Masalan: evocore audit path/to/file.mq5');
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`Fayl topilmadi: ${target}`);
    const { MQLValidator } = await import('../core/mql_validator.js');
    const audit = MQLValidator.auditMQL(fs.readFileSync(target, 'utf8'));
    output(values.json, audit, (a) => {
      console.log(`\n🛡️ MQL TRADING AUDITORI: "${target}"\n`);
      console.log(`- Holat: ${a.passed ? green('PASSED (kritik xatolarsiz)') : red('FAILED (kritik xatolar bor)')}`);
      console.log(`- Jami muammolar: ${a.totalIssues} (Kritik: ${a.criticalCount}, Ogohlantirish: ${a.warningCount}, Info: ${a.infoCount})\n`);
      for (const iss of a.issues) {
        const color = iss.severity === 'CRITICAL' ? red : (iss.severity === 'WARNING' ? yellow : cyan);
        console.log(`  ${color(`[${iss.severity}] ${iss.id}: ${iss.title}`)} — qator ${iss.line}${iss.occurrences > 1 ? ` (${iss.occurrences} marta)` : ''}`);
        console.log(`    Tavsif: ${iss.description}`);
        console.log(`    Tavsiya: ${green(iss.recommendedFix)}\n`);
      }
    });
    return audit.passed ? 0 : 2;
  },

  async trial({ values }) {
    if (!values.test && !values['test-id']) {
      throw new UsageError('Test buyrug\'i kerak: --test "npm test" yoki --test-id <evocore.config.json dagi id>.');
    }
    const baseline = values.baseline === undefined ? 0 : Number(values.baseline);
    if (!Number.isFinite(baseline)) throw new UsageError('--baseline son bo\'lishi kerak.');

    return withEvo(async (evo) => {
      if (!values.json) console.log(`\n⚡ Ratchet sinovi ishga tushdi (scope: ${evo.config.scope.join(', ')})...\n`);
      const step = await evo.executeEvolutionStep({
        taskTitle: values.title || values.hypothesis || 'CLI Task',
        hypothesis: values.hypothesis,
        domain: values.domain || 'GENERAL',
        testCommand: values.test,
        testCommandId: values['test-id'],
        signature: values.signature,
        rule: values.rule || '',
        rootCause: values['root-cause'] || '',
        verifiedCode: values.code || '',
        baselineScore: baseline,
        timeoutMs: toInt(values.timeout, 'timeout', undefined)
      });
      output(values.json, { success: step.success, action: step.action, scorecard: step.scorecard, ratchet: { ...step.ratchet, diff: undefined, stdout: undefined, stderr: undefined }, muse: step.muse, autoSkill: step.autoSkill }, () => {
        console.log(step.report);
        console.log();
      });
      return step.success ? 0 : 2;
    });
  },

  async evolve({ values }) {
    if (!values.file) throw new UsageError('Maqsad fayl kerak: --file src/app.js');
    if (!values.instruction) throw new UsageError('Ko\'rsatma kerak: --instruction "..."');
    const baseline = values.baseline === undefined ? 0 : Number(values.baseline);
    if (!Number.isFinite(baseline)) throw new UsageError('--baseline son bo\'lishi kerak.');
    const iterations = toInt(values.iterations, 'iterations', 3);

    const { LLMBridge } = await import('../core/llm_bridge.js');
    const { EvolutionLoop } = await import('../core/evolver.js');
    const llm = new LLMBridge({ provider: values.provider, model: values.model });

    return withEvo(async (evo) => {
      const describeEvent = (e) => {
        switch (e.type) {
          case 'start': return `▶ ${e.file} | ${e.provider} | ko'pi bilan ${e.maxIterations} iteratsiya`;
          case 'generating': return `  #${e.iteration} LLM nomzod yozmoqda...`;
          case 'testing': return `  #${e.iteration} ratchet sinovi...`;
          case 'result': return `  #${e.iteration} ${e.action === 'COMMITTED' ? green(e.action) : red(e.action)}${e.scorecard !== undefined ? ` (scorecard ${e.scorecard})` : ''}${e.commitHash ? ` commit ${e.commitHash}` : ''}`;
          case 'candidate_rejected': return `  #${e.iteration} ${yellow('nomzod rad etildi')}: ${e.reason}`;
          case 'llm_error': return `  #${e.iteration} ${yellow('LLM xatosi')}: ${e.error}`;
          case 'done': return `■ ${e.success ? green('muvaffaqiyatli') : red('natija yo\'q')} (${e.stoppedReason})`;
          default: return null;
        }
      };
      const loop = new EvolutionLoop(evo, {
        llm,
        onProgress: (e) => {
          if (values.json) return;
          const line = describeEvent(e);
          if (line) console.log(line);
        }
      });
      if (!values.json) console.log();
      const run = await loop.run({
        file: values.file,
        instruction: values.instruction,
        taskTitle: values.title,
        domain: values.domain || 'GENERAL',
        signature: values.signature,
        rule: values.rule || '',
        rootCause: values['root-cause'] || '',
        testCommand: values.test,
        testCommandId: values['test-id'],
        baselineScore: baseline,
        metricPattern: values.metric,
        maxIterations: iterations
      });
      output(values.json, run, (r) => {
        if (r.report) console.log(`\n${r.report}`);
        console.log();
      });
      return run.success ? 0 : 2;
    });
  },

  async rollback({ values }) {
    return withEvo((evo) => {
      const result = evo.ratchet.rollback('manual rollback (cli)');
      output(values.json, result, (r) => {
        if (!r.success) console.log(red(`\n✖ Rollback bajarilmadi: ${r.error}\n`));
        else if (!r.stashRef) console.log('\n• Scope ichida bekor qilinadigan o\'zgarish yo\'q.\n');
        else console.log(`\n✔ ${r.files.length} ta fayl stash'ga olindi. Tiklash: ${cyan(`git stash apply ${r.stashRef}`)}\n`);
      });
      return result.success ? 0 : 1;
    });
  },

  async 'reset-breaker'({ values }) {
    return withEvo((evo) => {
      const state = evo.resetCircuitBreaker();
      output(values.json, state, () => console.log(`\n${green('✔ Circuit breaker yopildi.')} Yangi sinovlar bajarilishi mumkin.\n`));
      return 0;
    });
  },

  async dashboard({ values }) {
    const { DashboardGenerator } = await import('../core/dashboard_generator.js');
    return withEvo((evo) => {
      const outPath = DashboardGenerator.generateHTML(evo, values.out || null);
      output(values.json, { path: outPath }, () => {
        console.log(`\n✔ Interaktiv vizual dashboard yaratildi:`);
        console.log(`  📂 Fayl: ${cyan(outPath)}`);
        console.log(`  💡 Brauzeringizda ochib ko'rishingiz mumkin!\n`);
      });
      return 0;
    });
  }
};

async function main(argv) {
  const { values, positionals } = parse(argv);
  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  const command = positionals[0] || (values.help ? 'help' : 'status');
  if (command === 'help' || values.help) {
    console.log(HELP);
    return 0;
  }
  const handler = Object.hasOwn(commands, command) ? commands[command] : null;
  if (!handler) {
    console.error(`Noma'lum buyruq: "${command}".`);
    console.error(HELP);
    return 1;
  }
  banner(values.json);
  return handler({ values, positionals });
}

process.on('SIGINT', () => process.exit(130));

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (err) {
  console.error(`\n❌ Xatolik: ${err.message}`);
  if (err instanceof UsageError) console.error('   Yordam uchun: evocore --help');
  if (process.env.EVO_DEBUG) console.error(err.stack);
  process.exitCode = 1;
}
