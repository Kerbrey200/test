/**
 * EVO-CORE VISUAL AUDIT DASHBOARD GENERATOR
 * Produces an offline, zero-dependency, self-contained HTML/CSS visual dashboard
 * for inspecting MUSE Memory, AutoSkill catalog, and Ratchet evolution history.
 * Every value is HTML-escaped and the page forbids scripts via CSP, so stored
 * data can never execute in the browser.
 */

import fs from 'node:fs';
import path from 'node:path';
import { VERSION } from './version.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

export class DashboardGenerator {
  /**
   * Generates a self-contained HTML report.
   */
  static generateHTML(evoCore, outputPath = null) {
    const status = evoCore.getStatus();
    const skills = evoCore.skills.getAllSkills();
    const experiences = evoCore.memory.findRelevantExperiences('', null, { limit: 1000, includeArchived: true });
    const history = evoCore.memory.listTrajectories({ limit: 50 });
    const e = escapeHtml;

    const outPath = outputPath || path.join(evoCore.rootDir, 'storage', 'dashboard.html');

    const html = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>EvoCore Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --success: #22c55e;
      --danger: #ef4444;
      --warning: #f59e0b;
      --border: #334155;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 30px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 30px; }
    h1 { margin: 0 0 10px 0; color: var(--primary); font-size: 26px; }
    .badge { background: #0284c7; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
    .card-title { font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; }
    .card-val { font-size: 32px; font-weight: bold; }
    .card-sub { font-size: 12px; color: var(--text-muted); }
    .section-title { font-size: 20px; margin: 30px 0 15px 0; border-left: 4px solid var(--primary); padding-left: 10px; }
    .table-wrap { overflow-x: auto; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: top; }
    th { background: #1a2234; color: var(--text-muted); font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .tag { background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 4px; }
    .utility-high { color: var(--success); font-weight: bold; }
    .utility-low { color: var(--danger); font-weight: bold; }
    .muted { color: var(--text-muted); }
    pre { background: #090d16; padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto; color: #a5b4fc; white-space: pre-wrap; word-break: break-word; margin: 0; }
    @media (max-width: 640px) { body { padding: 16px; } h1 { font-size: 20px; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏛️ EvoCore: Tri-Core Autonomous Evolution Dashboard <span class="badge">v${e(VERSION)} ZERO-FAT</span></h1>
      <p style="margin: 0; color: var(--text-muted);">Karpathy Autoresearch (Git Ratchet) + MUSE (Episodic Memory) + AutoSkill (Lifelong Distiller) · ${e(new Date().toISOString())}</p>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Faol Ko'nikmalar (AutoSkill)</div>
        <div class="card-val" style="color: var(--primary);">${e(status.activeSkillsCount)}</div>
        <div class="card-sub">jami: ${e(status.totalSkillsCount)}</div>
      </div>
      <div class="card">
        <div class="card-title">MUSE Tajribalari</div>
        <div class="card-val" style="color: var(--success);">${e(status.activeExperiencesCount)}</div>
        <div class="card-sub">jami: ${e(status.experiencesCount)}</div>
      </div>
      <div class="card">
        <div class="card-title">Bajarilgan Sinovlar (Ratchet)</div>
        <div class="card-val">${e(status.historyCount)}</div>
      </div>
      <div class="card">
        <div class="card-title">Circuit Breaker Holati</div>
        <div class="card-val" style="color: ${status.circuitOpen ? 'var(--danger)' : (status.circuitBreakerFailures === 0 ? 'var(--success)' : 'var(--warning)')};">
          ${e(status.circuitBreakerFailures)} / ${e(status.maxConsecutiveFailures)}
        </div>
        <div class="card-sub">${status.circuitOpen ? 'OCHIQ — sinovlar bloklangan' : 'yopiq'}</div>
      </div>
    </div>

    <div class="section-title">📚 Faol Ko'nikmalar Katalogi (AutoSkill)</div>
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Ko'nikma Nomi</th>
          <th>Domen</th>
          <th>Versiya</th>
          <th>Utility Score</th>
          <th>Holat</th>
          <th>Tavsif</th>
        </tr>
      </thead>
      <tbody>
        ${skills.length === 0 ? '<tr><td colspan="6" class="muted" style="text-align: center;">Ko\'nikmalar mavjud emas</td></tr>' : ''}
        ${skills.map(s => `
          <tr>
            <td><strong>${e(s.name)}</strong></td>
            <td><span class="tag">${e(s.domain || 'GENERAL')}</span></td>
            <td>v${e(s.version)}</td>
            <td class="${s.utility_score >= 0.8 ? 'utility-high' : 'utility-low'}">${e(s.utility_score)}</td>
            <td>${s.active ? 'Faol' : 'Arxiv'}</td>
            <td class="muted">${e(s.description || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>

    <div class="section-title">🧠 MUSE Episodik Traektoriya Xotirasi (SQLite)</div>
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Domen / Imzo</th>
          <th>Ildiz Sabab (Root Cause)</th>
          <th>Tekshirilgan Yechim</th>
          <th>Hits / Regr</th>
          <th>Utility</th>
        </tr>
      </thead>
      <tbody>
        ${experiences.length === 0 ? '<tr><td colspan="5" class="muted" style="text-align: center;">Tajribalar mavjud emas</td></tr>' : ''}
        ${experiences.map(x => `
          <tr>
            <td><span class="tag">${e(x.domain)}</span><br><code>${e(x.signature)}</code></td>
            <td style="font-size: 13px;">${e(x.root_cause)}</td>
            <td><pre>${e(x.winning_fix)}</pre></td>
            <td>${e(x.hits)} / ${e(x.regressions)}</td>
            <td class="${x.utility_score >= 0.8 ? 'utility-high' : 'utility-low'}">${e(x.utility_score)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>

    <div class="section-title">🕘 Oxirgi Ratchet Sinovlari</div>
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Vaqt</th><th>Natija</th><th>Gipoteza</th><th>Exit</th><th>Score</th><th>Davomiylik</th></tr>
      </thead>
      <tbody>
        ${history.length === 0 ? '<tr><td colspan="6" class="muted" style="text-align: center;">Sinovlar mavjud emas</td></tr>' : ''}
        ${history.map(t => `
          <tr>
            <td>${e(t.created_at)}</td>
            <td class="${t.action === 'COMMITTED' ? 'utility-high' : 'utility-low'}">${e(t.action)}</td>
            <td>${e(t.hypothesis)}</td>
            <td>${t.exit_code === -1 ? '—' : e(t.exit_code)}</td>
            <td>${t.score === null ? '—' : e(t.score)}</td>
            <td>${t.duration_ms === null ? '—' : `${e(t.duration_ms)} ms`}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  </div>
</body>
</html>`;

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const tmpPath = `${outPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, html, 'utf8');
    fs.renameSync(tmpPath, outPath);
    return outPath;
  }
}
