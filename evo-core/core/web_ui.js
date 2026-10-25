/**
 * EVO-CORE FULL CONTROL WEB INTERFACE
 * Single-Page Application (SPA) with zero external CDN dependencies.
 * Provides interactive controls for Ratchet trials, MUSE memory, AutoSkill editing, MQL audits, and test execution.
 */

export function getFullControlHTML(port = 3777) {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EvoCore: Tri-Core Autonomous Evolution Studio</title>
  <style>
    :root {
      --bg: #090d16;
      --panel: #131c2e;
      --card: #1b263b;
      --border: #2d3d5a;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --code-bg: #05080f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    /* Sidebar */
    aside {
      width: 260px;
      background: var(--panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }
    .brand {
      padding: 20px;
      font-size: 18px;
      font-weight: bold;
      color: var(--primary);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand span { font-size: 11px; background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; }
    nav { flex: 1; padding: 15px 10px; display: flex; flex-direction: column; gap: 6px; }
    .nav-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      padding: 10px 14px;
      border-radius: 6px;
      text-align: left;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s;
    }
    .nav-btn:hover { background: var(--card); color: var(--text); }
    .nav-btn.active { background: #0369a1; color: white; border-color: var(--primary); font-weight: 600; }
    .sidebar-footer { padding: 15px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
    /* Main Content */
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      background: var(--bg);
    }
    header {
      padding: 16px 30px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .view-content { padding: 25px 30px; flex: 1; }
    .hidden { display: none !important; }
    /* Cards and Grids */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 25px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
    .card-title { font-size: 12px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .card-val { font-size: 28px; font-weight: bold; }
    /* Forms & Controls */
    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 25px; }
    .panel-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: var(--primary); display: flex; align-items: center; justify-content: space-between; }
    .form-group { margin-bottom: 14px; }
    label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 5px; }
    input, textarea, select {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 9px 12px;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
      font-family: inherit;
    }
    textarea { font-family: monospace; resize: vertical; }
    input:focus, textarea:focus { border-color: var(--primary); }
    .btn {
      background: var(--primary);
      color: #032030;
      border: none;
      padding: 10px 18px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-danger { background: var(--danger); color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-secondary { background: var(--card); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--border); }
    /* Tables */
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { background: #0c1322; color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 11px; }
    tr:hover { background: rgba(56, 189, 248, 0.04); }
    .badge-tag { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 11px; border: 1px solid var(--border); }
    pre { background: var(--code-bg); padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; color: #a5b4fc; border: 1px solid var(--border); margin: 0; }
    .status-pill { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
    .pill-success { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .pill-danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .pill-warning { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
  </style>
</head>
<body>

  <!-- Sidebar -->
  <aside>
    <div class="brand">
      🏛️ EvoCore Studio
      <span>ZERO-FAT</span>
    </div>
    <nav>
      <button class="nav-btn active" onclick="switchTab('dashboard')">📊 Asosiy Dashboard</button>
      <button class="nav-btn" onclick="switchTab('ratchet')">⚡ Ratchet Evolution</button>
      <button class="nav-btn" onclick="switchTab('mql')">📈 MQL Trading Auditor</button>
      <button class="nav-btn" onclick="switchTab('memory')">🧠 MUSE Xotirasi</button>
      <button class="nav-btn" onclick="switchTab('skills')">📚 AutoSkill Kutubxonasi</button>
      <button class="nav-btn" onclick="switchTab('terminal')">💻 Sinov & Terminal</button>
    </nav>
    <div class="sidebar-footer">
      <div>Server: localhost:${port}</div>
      <div style="margin-top: 4px; color: var(--success);">● Tizim Ishchi Holatda</div>
    </div>
  </aside>

  <!-- Main Content -->
  <main>
    <header>
      <div id="view-title" style="font-weight: bold; font-size: 18px;">Asosiy Dashboard</div>
      <div>
        <button class="btn btn-secondary" onclick="refreshAllData()">🔄 Yangilash</button>
      </div>
    </header>

    <div class="view-content">

      <!-- 1. DASHBOARD TAB -->
      <div id="tab-dashboard">
        <div class="grid">
          <div class="card">
            <div class="card-title">Faol Ko'nikmalar</div>
            <div class="card-val" id="dash-skills" style="color: var(--primary);">0</div>
          </div>
          <div class="card">
            <div class="card-title">MUSE Xotira Tajribalari</div>
            <div class="card-val" id="dash-memory" style="color: var(--success);">0</div>
          </div>
          <div class="card">
            <div class="card-title">Bajarilgan Sinovlar</div>
            <div class="card-val" id="dash-history">0</div>
          </div>
          <div class="card">
            <div class="card-title">Circuit Breaker</div>
            <div class="card-val" id="dash-cb" style="color: var(--success);">0 / 3</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">⚡ Tezkor Harakatlar</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn" onclick="switchTab('ratchet')">🚀 Yangi Ratchet Sinovi</button>
            <button class="btn btn-secondary" onclick="switchTab('mql')">🛡️ MQL Kodini Tekshirish</button>
            <button class="btn btn-secondary" onclick="runTestSuite()">🧪 Barcha Testlarni Yurgizish</button>
            <button class="btn btn-danger" onclick="executeRollback()">⏪ Toza Git Rollback</button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">📚 Oxirgi O'rganilgan Ko'nikmalar</div>
          <div id="dash-skills-list">Yuklanmoqda...</div>
        </div>
      </div>

      <!-- 2. RATCHET EVOLUTION TAB -->
      <div id="tab-ratchet" class="hidden">
        <div class="panel">
          <div class="panel-title">🚀 Yangi Karpathy Ratchet Sinovi Boshlash</div>
          <div class="form-group">
            <label>Topshiriq Sarlavhasi (Task Title):</label>
            <input type="text" id="r-title" value="MQL5 buffer va hisoblash indeksatsiyasini yaxshilash">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="form-group">
              <label>Domen (Domain):</label>
              <select id="r-domain">
                <option value="MQL_TRADING">MQL_TRADING (Forex/MetaTrader)</option>
                <option value="MATH_OPTIMIZE">MATH_OPTIMIZE (Algoritmik Matematika)</option>
                <option value="GENERAL">GENERAL (Umumiy Tizim)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Gipoteza Imzosi (Signature):</label>
              <input type="text" id="r-sig" value="MQL5_ARRAY_INDEXING_INVARIANT">
            </div>
          </div>
          <div class="form-group">
            <label>Test Buyrug'i (Test Command):</label>
            <input type="text" id="r-cmd" value="npm test">
          </div>
          <div class="form-group">
            <label>Yechim Qoidasi (Actionable Invariant):</label>
            <input type="text" id="r-rule" value="ArraySetAsSeries(buffer, true) OnInit ichida chaqirilsin">
          </div>
          <div class="form-group">
            <label>Tekshirilgan Kod Namunasi:</label>
            <textarea id="r-code" rows="3">ArraySetAsSeries(rates, true);</textarea>
          </div>
          <button class="btn" onclick="executeRatchetStep()">⚡ Sinovni Ishga Tushirish</button>
        </div>

        <div class="panel" id="r-result-panel" style="display: none;">
          <div class="panel-title">📋 8-Bo'limli Xolis Dalil Hisoboti</div>
          <pre id="r-report-output"></pre>
        </div>
      </div>

      <!-- 3. MQL AUDITOR TAB -->
      <div id="tab-mql" class="hidden">
        <div class="panel">
          <div class="panel-title">🛡️ MQL4 / MQL5 Savdo Kodi Auditori</div>
          <div class="form-group">
            <label>MQL Kodini shu yerga kiriting:</label>
            <textarea id="mql-code-input" rows="10" placeholder="int OnInit() { ... }"></textarea>
          </div>
          <button class="btn" onclick="runMQLAudit()">🛡️ Kodni Audit Qilish</button>
          <button class="btn btn-secondary" onclick="loadMQLSample()">📋 Namunaviy Kod Yuklash</button>
        </div>

        <div class="panel" id="mql-result-panel" style="display: none;">
          <div class="panel-title">📊 Audit Xulosasi</div>
          <div id="mql-audit-summary" style="margin-bottom: 15px;"></div>
          <div id="mql-audit-issues"></div>
        </div>
      </div>

      <!-- 4. MUSE MEMORY TAB -->
      <div id="tab-memory" class="hidden">
        <div class="panel">
          <div class="panel-title">🧠 MUSE Episodik Traektoriya Xotirasi (SQLite)</div>
          <table>
            <thead>
              <tr>
                <th>Domen</th>
                <th>Imzo (Signature)</th>
                <th>Ildiz Sabab</th>
                <th>Yechim</th>
                <th>Hits/Regr</th>
                <th>Utility</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody id="memory-table-body">
              <tr><td colspan="7">Yuklanmoqda...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. AUTOSKILL TAB -->
      <div id="tab-skills" class="hidden">
        <div class="panel">
          <div class="panel-title">📚 AutoSkill Faol Ko'nikmalar Katalogi</div>
          <table>
            <thead>
              <tr>
                <th>Ko'nikma Nomi</th>
                <th>Domen</th>
                <th>Versiya</th>
                <th>Utility</th>
                <th>Harakat</th>
              </tr>
            </thead>
            <tbody id="skills-table-body">
              <tr><td colspan="5">Yuklanmoqda...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 6. TERMINAL & TEST TAB -->
      <div id="tab-terminal" class="hidden">
        <div class="panel">
          <div class="panel-title">
            💻 Test Konsoli
            <button class="btn" onclick="runTestSuite()">🧪 npm test ni Ishga Tushirish</button>
          </div>
          <pre id="terminal-output">Sinovni boshlash uchun tugmani bosing...</pre>
        </div>
      </div>

    </div>
  </main>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.view-content > div').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.remove('hidden');
      
      const navBtn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.getAttribute('onclick').includes(tabId));
      if (navBtn) navBtn.classList.add('active');

      const titles = {
        dashboard: 'Asosiy Dashboard',
        ratchet: 'Karpathy Ratchet Evolution Studio',
        mql: 'MQL4 / MQL5 Trading Code Auditor',
        memory: 'MUSE Episodik Xotira Bazasi',
        skills: 'AutoSkill Faol Modullar Katalogi',
        terminal: 'Terminal & Unit Test Konsoli'
      };
      document.getElementById('view-title').innerText = titles[tabId] || 'EvoCore Studio';

      if (tabId === 'memory') loadMemory();
      if (tabId === 'skills') loadSkills();
    }

    async function refreshAllData() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('dash-skills').innerText = data.activeSkillsCount;
        document.getElementById('dash-memory').innerText = data.experiencesCount;
        document.getElementById('dash-history').innerText = data.historyCount;
        document.getElementById('dash-cb').innerText = data.circuitBreakerFailures + ' / 3';

        loadSkillsMini();
      } catch (e) {
        console.error(e);
      }
    }

    async function loadSkillsMini() {
      const res = await fetch('/api/skills');
      const skills = await res.json();
      const container = document.getElementById('dash-skills-list');
      if (skills.length === 0) {
        container.innerHTML = '<span style="color: var(--muted);">Ko\\'nikmalar mavjud emas.</span>';
        return;
      }
      container.innerHTML = skills.map(s => \`
        <div style="padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
          <div><strong>\${s.name}</strong> <span class="badge-tag">v\${s.version}</span> - <span style="color: var(--muted);">\${s.description || ''}</span></div>
          <div style="color: var(--success); font-weight: bold;">U: \${s.utility_score}</div>
        </div>
      \`).join('');
    }

    async function loadSkills() {
      const res = await fetch('/api/skills');
      const skills = await res.json();
      const tbody = document.getElementById('skills-table-body');
      tbody.innerHTML = skills.map(s => \`
        <tr>
          <td><strong>\${s.name}</strong></td>
          <td><span class="badge-tag">\${s.domain || 'GENERAL'}</span></td>
          <td>v\${s.version}</td>
          <td style="color: var(--success); font-weight: bold;">\${s.utility_score}</td>
          <td><span class="status-pill pill-success">Faol</span></td>
        </tr>
      \`).join('');
    }

    async function loadMemory() {
      const res = await fetch('/api/memory');
      const experiences = await res.json();
      const tbody = document.getElementById('memory-table-body');
      tbody.innerHTML = experiences.map(e => \`
        <tr>
          <td><span class="badge-tag">\${e.domain}</span></td>
          <td><code>\${e.signature}</code></td>
          <td style="font-size: 12px;">\${e.root_cause}</td>
          <td><pre style="margin: 0; padding: 4px;">\${e.winning_fix}</pre></td>
          <td>\${e.hits} / \${e.regressions}</td>
          <td style="color: \${e.utility_score >= 0.5 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">\${e.utility_score}</td>
          <td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="reportRegress('\${e.signature}')">Regressiya</button></td>
        </tr>
      \`).join('');
    }

    async function reportRegress(sig) {
      if (!confirm(\`"\${sig}" bo'yicha regressiya qayd etilsinmi?\`)) return;
      await fetch('/api/memory/regress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: sig })
      });
      loadMemory();
    }

    async function executeRatchetStep() {
      const body = {
        taskTitle: document.getElementById('r-title').value,
        domain: document.getElementById('r-domain').value,
        hypothesis: document.getElementById('r-title').value,
        testCommand: document.getElementById('r-cmd').value,
        signature: document.getElementById('r-sig').value,
        rule: document.getElementById('r-rule').value,
        verifiedCode: document.getElementById('r-code').value
      };

      const res = await fetch('/api/ratchet/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      document.getElementById('r-result-panel').style.display = 'block';
      document.getElementById('r-report-output').innerText = data.report || JSON.stringify(data, null, 2);
      refreshAllData();
    }

    async function executeRollback() {
      if (!confirm('Haqiqatdan ham barcha tasdiqlanmagan o\'zgarishlar bekor qilinsinmi? (Git Rollback)')) return;
      const res = await fetch('/api/ratchet/rollback', { method: 'POST' });
      const data = await res.json();
      alert(data.success ? '✔ Rollback muvaffaqiyatli bajarildi!' : 'Xatolik yuz berdi');
      refreshAllData();
    }

    function loadMQLSample() {
      document.getElementById('mql-code-input').value = \`
int OnInit() {
   SetIndexBuffer(0, Buffer, INDICATOR_DATA);
   return(0);
}

int start() {
   int counted = IndicatorCounted();
   OrderSend(Symbol(), OP_BUY, 0.1, Ask, 3, 0, 0);
   return(0);
}
\`.trim();
    }

    async function runMQLAudit() {
      const code = document.getElementById('mql-code-input').value;
      const res = await fetch('/api/audit/mql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();

      document.getElementById('mql-result-panel').style.display = 'block';
      const summary = document.getElementById('mql-audit-summary');
      summary.innerHTML = \`
        <span class="status-pill \${data.passed ? 'pill-success' : 'pill-danger'}">
          \${data.passed ? 'PASSED (Kritik xatolarsiz)' : 'FAILED (Kritik xatolar mavjud)'}
        </span>
        <span style="margin-left: 10px; color: var(--muted);">Jami: \${data.totalIssues} (Kritik: \${data.criticalCount}, Ogohlantirish: \${data.warningCount})</span>
      \`;

      const issuesContainer = document.getElementById('mql-audit-issues');
      issuesContainer.innerHTML = data.issues.map(iss => \`
        <div style="background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
          <div style="font-weight: bold; color: \${iss.severity === 'CRITICAL' ? 'var(--danger)' : 'var(--warning)'}; margin-bottom: 4px;">
            [\${iss.severity}] \${iss.id}: \${iss.title}
          </div>
          <div style="font-size: 13px; color: var(--muted); margin-bottom: 6px;">\${iss.description}</div>
          <div style="font-size: 12px; color: var(--success); font-family: monospace;">Tavsiya: \${iss.recommendedFix}</div>
        </div>
      \`).join('');
    }

    async function runTestSuite() {
      const pre = document.getElementById('terminal-output');
      pre.innerText = 'Testlar ishga tushirilmoqda (npm test)...';
      switchTab('terminal');

      const res = await fetch('/api/tests/run', { method: 'POST' });
      const data = await res.json();
      pre.innerText = data.output || 'Test tugadi.';
      refreshAllData();
    }

    // Initial load
    refreshAllData();
  </script>
</body>
</html>`;
}
