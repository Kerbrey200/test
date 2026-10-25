/**
 * EVO-CORE VISUAL AUDIT DASHBOARD GENERATOR
 * Produces an offline, zero-dependency, self-contained HTML/CSS visual dashboard
 * for inspecting MUSE Memory, AutoSkill catalog, and Ratchet evolution history.
 */

import fs from 'node:fs';
import path from 'node:path';

export class DashboardGenerator {
  /**
   * Generates a self-contained HTML report.
   */
  static generateHTML(evoCore, outputPath = null) {
    const status = evoCore.getStatus();
    const skills = evoCore.skills.getActiveSkills();
    const experiences = evoCore.memory.findRelevantExperiences('', null);
    const history = evoCore.ratchet.executionHistory;

    const outPath = outputPath || path.join(evoCore.rootDir, 'storage', 'dashboard.html');

    const html = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <title>EvoCore: Tri-Core Autonomous Evolution Dashboard</title>
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
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
    .card-title { font-size: 13px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; }
    .card-val { font-size: 32px; font-weight: bold; }
    .section-title { font-size: 20px; margin: 30px 0 15px 0; border-left: 4px solid var(--primary); padding-left: 10px; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; margin-bottom: 30px; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); font-size: 14px; }
    th { background: #1a2234; color: var(--text-muted); font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .tag { background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 4px; }
    .utility-high { color: var(--success); font-weight: bold; }
    .utility-low { color: var(--danger); font-weight: bold; }
    pre { background: #090d16; padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto; color: #a5b4fc; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏛️ EvoCore: Tri-Core Autonomous Evolution Dashboard <span class="badge">v1.0.0 ZERO-FAT</span></h1>
      <p style="margin: 0; color: var(--text-muted);">Karpathy Autoresearch (Git Ratchet) + MUSE (Episodic Memory) + AutoSkill (Lifelong Distiller)</p>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Faol Ko'nikmalar (AutoSkill)</div>
        <div class="card-val" style="color: var(--primary);">${status.activeSkillsCount}</div>
      </div>
      <div class="card">
        <div class="card-title">MUSE Tajribalari</div>
        <div class="card-val" style="color: var(--success);">${status.experiencesCount}</div>
      </div>
      <div class="card">
        <div class="card-title">Bajarilgan Sinovlar (Ratchet)</div>
        <div class="card-val">${status.historyCount}</div>
      </div>
      <div class="card">
        <div class="card-title">Circuit Breaker Holati</div>
        <div class="card-val" style="color: ${status.circuitBreakerFailures === 0 ? 'var(--success)' : 'var(--warning)'};">
          ${status.circuitBreakerFailures} / 3
        </div>
      </div>
    </div>

    <div class="section-title">📚 Faol Ko'nikmalar Katalogi (AutoSkill)</div>
    <table>
      <thead>
        <tr>
          <th>Ko'nikma Nomi</th>
          <th>Domen</th>
          <th>Versiya</th>
          <th>Utility Score</th>
          <th>Tavsif</th>
        </tr>
      </thead>
      <tbody>
        ${skills.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Ko\'nikmalar mavjud emas</td></tr>' : ''}
        ${skills.map(s => `
          <tr>
            <td><strong>${s.name}</strong></td>
            <td><span class="tag">${s.domain || 'GENERAL'}</span></td>
            <td>v${s.version}</td>
            <td class="${parseFloat(s.utility_score) >= 0.8 ? 'utility-high' : 'utility-low'}">${s.utility_score}</td>
            <td style="color: var(--text-muted);">${s.description || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="section-title">🧠 MUSE Episodik Traektoriya Xotirasi (SQLite)</div>
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
        ${experiences.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Tajribalar mavjud emas</td></tr>' : ''}
        ${experiences.map(e => `
          <tr>
            <td><span class="tag">${e.domain}</span><br><code>${e.signature}</code></td>
            <td style="font-size: 13px;">${e.root_cause}</td>
            <td><pre style="margin: 0;">${e.winning_fix}</pre></td>
            <td>${e.hits} / ${e.regressions}</td>
            <td class="${e.utility_score >= 0.8 ? 'utility-high' : 'utility-low'}">${e.utility_score}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    fs.writeFileSync(outPath, html, 'utf8');
    return outPath;
  }
}
