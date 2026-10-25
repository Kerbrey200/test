#!/usr/bin/env node
/**
 * EVO-CORE STUDIO WEB SERVER RUNNER
 * Usage: node bin/serve.js [--port 3777]
 */

import { EvoServer } from '../core/server.js';

let port = 3777;
const portArgIdx = process.argv.indexOf('--port');
if (portArgIdx > -1 && process.argv[portArgIdx + 1]) {
  port = parseInt(process.argv[portArgIdx + 1], 10);
}

const server = new EvoServer({ port, rootDir: process.cwd() });

console.log('\n' + '='.repeat(85));
console.log('🏛️  EVO-CORE: TRI-CORE AUTONOMOUS EVOLUTION STUDIO (WEB CONTROL PANEL)');
console.log('='.repeat(85));

try {
  const url = await server.start();
  console.log(`\n✔ EvoCore Studio muvaffaqiyatli ishga tushdi!`);
  console.log(`  🌐 Web Boshqaruv Paneli: \x1b[36m\x1b[1m${url}\x1b[0m`);
  console.log(`  💡 Brauzeringizda ushbu havolani oching va to'liq nazoratga ega bo'ling!`);
  console.log(`\nServerni to'xtatish uchun: Ctrl + C bosing.\n`);
} catch (err) {
  console.error(`❌ Serverni ishga tushirishda xatolik:`, err.message);
  process.exit(1);
}
