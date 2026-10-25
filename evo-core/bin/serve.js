#!/usr/bin/env node
/**
 * EVO-CORE STUDIO WEB SERVER RUNNER
 * Usage: node bin/serve.js [--port 3777] [--host 127.0.0.1]
 * The API token is generated per start (or taken from EVO_TOKEN) and embedded in the printed URL.
 */

import { parseArgs } from 'node:util';
import { EvoServer } from '../core/server.js';

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  }));
} catch (err) {
  fail(err.message);
}

if (args.help) {
  console.log('Foydalanish: node bin/serve.js [--port 3777] [--host 127.0.0.1]');
  process.exit(0);
}

let port;
if (args.port !== undefined) {
  port = Number(args.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`Noto'g'ri port: "${args.port}" (0-65535 oralig'ida butun son bo'lishi kerak).`);
}

let server;
try {
  server = new EvoServer({ port, host: args.host, rootDir: process.cwd() });
} catch (err) {
  fail(`Sozlamalarda xatolik: ${err.message}`);
}

console.log('\n' + '='.repeat(85));
console.log('🏛️  EVO-CORE: TRI-CORE AUTONOMOUS EVOLUTION STUDIO (WEB CONTROL PANEL)');
console.log('='.repeat(85));

try {
  await server.start();
} catch (err) {
  fail(`Serverni ishga tushirishda xatolik: ${err.message}`);
}

const local = ['127.0.0.1', 'localhost', '::1'].includes(server.host) || server.host.startsWith('127.');
console.log(`\n✔ EvoCore Studio muvaffaqiyatli ishga tushdi!`);
console.log(`  🌐 Web Boshqaruv Paneli: \x1b[36m\x1b[1m${server.uiUrl}\x1b[0m`);
console.log(`  🔐 Havolada shu sessiya uchun API token bor — uni boshqalarga bermang.`);
if (!local) {
  console.log(`  \x1b[33m⚠ Server ${server.host} manzilida tarmoqqa ochiq. Token bilan himoyalangan, lekin faqat ishonchli tarmoqda ishlating.\x1b[0m`);
}
console.log(`\nServerni to'xtatish uchun: Ctrl + C bosing.\n`);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} qabul qilindi — joriy vazifalar tugashi kutilmoqda...`);
  const force = setTimeout(() => process.exit(1), 30000);
  force.unref();
  await server.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
