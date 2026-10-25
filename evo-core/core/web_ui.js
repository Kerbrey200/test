/**
 * EVO-CORE FULL CONTROL WEB INTERFACE
 * Single-Page Application (SPA) with zero external CDN dependencies.
 * Provides interactive controls for Ratchet trials, MUSE memory, AutoSkill, code audits and test execution.
 *
 * Security: all data is rendered with textContent (never innerHTML), there are no inline
 * event handlers, and the only script carries the per-response CSP nonce. The API token
 * arrives in the URL fragment, is kept in sessionStorage and sent as a Bearer header.
 */

const STYLES = `
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
    aside { width: 260px; background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
    .brand { padding: 20px; font-size: 18px; font-weight: bold; color: var(--primary); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
    .brand span { font-size: 11px; background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; }
    nav { flex: 1; padding: 15px 10px; display: flex; flex-direction: column; gap: 6px; }
    .nav-btn { background: transparent; border: 1px solid transparent; color: var(--muted); padding: 10px 14px; border-radius: 6px; text-align: left; font-size: 14px; cursor: pointer; transition: all 0.2s; }
    .nav-btn:hover { background: var(--card); color: var(--text); }
    .nav-btn.active { background: #0369a1; color: white; border-color: var(--primary); font-weight: 600; }
    .sidebar-footer { padding: 15px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
    main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
    header { padding: 16px 30px; background: var(--panel); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .view-content { padding: 25px 30px; flex: 1; }
    .hidden { display: none !important; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 25px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
    .card-title { font-size: 12px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .card-val { font-size: 28px; font-weight: bold; }
    .card-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 25px; }
    .panel-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: var(--primary); display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .form-group { margin-bottom: 14px; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 5px; }
    input, textarea, select { width: 100%; background: var(--card); border: 1px solid var(--border); color: var(--text); padding: 9px 12px; border-radius: 6px; font-size: 14px; outline: none; font-family: inherit; }
    input[type="checkbox"] { width: auto; }
    textarea { font-family: monospace; resize: vertical; }
    input:focus, textarea:focus, select:focus { border-color: var(--primary); }
    .btn { background: var(--primary); color: #032030; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.2s; }
    .btn:hover { background: var(--primary-hover); }
    .btn:disabled { opacity: 0.5; cursor: wait; }
    .btn-danger { background: var(--danger); color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-secondary { background: var(--card); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--border); }
    .btn-small { padding: 4px 8px; font-size: 11px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: top; }
    th { background: #0c1322; color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 11px; }
    tr:hover td { background: rgba(56, 189, 248, 0.04); }
    .badge-tag { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 11px; border: 1px solid var(--border); }
    pre { background: var(--code-bg); padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; color: #a5b4fc; border: 1px solid var(--border); margin: 0; white-space: pre-wrap; word-break: break-word; }
    .status-pill { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
    .pill-success { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .pill-danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .pill-warning { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
    .pill-muted { background: rgba(148, 163, 184, 0.2); color: var(--muted); }
    .muted { color: var(--muted); }
    .issue { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px; }
    .issue-title { font-weight: bold; margin-bottom: 4px; }
    .sev-CRITICAL { color: var(--danger); }
    .sev-WARNING { color: var(--warning); }
    .sev-INFO { color: var(--primary); }
    #toast { position: fixed; right: 20px; bottom: 20px; max-width: 420px; padding: 12px 16px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.4); font-size: 13px; z-index: 10; }
    #toast.error { border-color: var(--danger); color: #fecaca; }
    @media (max-width: 760px) {
      body { flex-direction: column; height: auto; min-height: 100vh; overflow: visible; }
      aside { width: 100%; border-right: none; border-bottom: 1px solid var(--border); }
      nav { flex-direction: row; overflow-x: auto; padding: 8px; }
      .nav-btn { white-space: nowrap; }
      .sidebar-footer { display: none; }
      header, .view-content { padding: 14px 16px; }
    }
`;

/**
 * Browser application. Serialised with Function.prototype.toString(), never executed in Node.
 */
function clientApp() {
  'use strict';

  var state = { token: null, config: null, tab: 'dashboard' };
  var TITLES = {
    dashboard: 'Asosiy Dashboard',
    ratchet: 'Karpathy Ratchet Evolution Studio',
    analyze: 'Kod Tahlili: MQL Auditor va AST',
    memory: 'MUSE Episodik Xotira Bazasi',
    skills: 'AutoSkill Modullar Katalogi',
    history: 'Sinovlar Tarixi (Trayektoriyalar)',
    terminal: 'Terminal va Test Konsoli'
  };
  var ACTION_PILLS = {
    COMMITTED: 'pill-success',
    NO_CHANGES: 'pill-muted',
    CIRCUIT_OPEN: 'pill-warning',
    ROLLBACK_FAILED: 'pill-warning'
  };

  function $(id) { return document.getElementById(id); }

  // Builds DOM nodes; every text value goes through textContent, so data can never become markup.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') node.textContent = String(value);
      else if (key === 'class') node.className = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function pill(text, cls) {
    return el('span', { class: 'status-pill ' + cls, text: text });
  }

  function actionPill(action) {
    return pill(action || 'N/A', ACTION_PILLS[action] || 'pill-danger');
  }

  function emptyRow(colspan, text) {
    return el('tr', {}, [el('td', { colspan: colspan, class: 'muted', text: text })]);
  }

  var toastTimer = null;
  function toast(message, isError) {
    var box = $('toast');
    box.textContent = message;
    box.className = isError ? 'error' : '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = 'hidden'; }, 5000);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function loadToken() {
    var match = location.hash.match(/token=([^&]+)/);
    if (match) {
      state.token = decodeURIComponent(match[1]);
      try { sessionStorage.setItem('evocore.token', state.token); } catch (e) { /* storage unavailable */ }
      history.replaceState(null, '', location.pathname);
      return;
    }
    try { state.token = sessionStorage.getItem('evocore.token'); } catch (e) { state.token = null; }
  }

  function showAuth(visible) {
    $('auth-panel').classList.toggle('hidden', !visible);
  }

  async function api(path, options) {
    options = options || {};
    var headers = { Authorization: 'Bearer ' + (state.token || '') };
    var init = { method: options.method || 'GET', headers: headers };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    var res = await fetch(path, init);
    var data = await res.json().catch(function () { return {}; });
    if (res.status === 401) {
      showAuth(true);
      throw new Error('API token noto‘g‘ri yoki kiritilmagan.');
    }
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    showAuth(false);
    return data;
  }

  async function waitForJob(jobId, onUpdate) {
    for (;;) {
      var job = await api('/api/jobs/' + jobId);
      if (onUpdate) onUpdate(job);
      if (job.status === 'done' || job.status === 'failed') return job;
      await sleep(1000);
    }
  }

  function switchTab(tab) {
    if (!TITLES[tab]) return;
    state.tab = tab;
    document.querySelectorAll('[data-view]').forEach(function (view) {
      view.classList.toggle('hidden', view.getAttribute('data-view') !== tab);
    });
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    $('view-title').textContent = TITLES[tab];
    refreshTab().catch(function (err) { toast(err.message, true); });
  }

  async function refreshTab() {
    if (state.tab === 'dashboard') return loadDashboard();
    if (state.tab === 'memory') return loadMemory();
    if (state.tab === 'skills') return loadSkills();
    if (state.tab === 'history') return loadHistory();
  }

  async function loadConfig() {
    state.config = await api('/api/config');
    var ids = Object.keys(state.config.testCommands);
    ['r-cmd', 't-cmd'].forEach(function (id) {
      var select = clear($(id));
      ids.forEach(function (cmdId) {
        select.appendChild(el('option', { value: cmdId, text: cmdId + ' — ' + state.config.testCommands[cmdId] }));
      });
    });
    $('r-scope').textContent = 'Scope: ' + state.config.scope.join(', ') + '  |  Istisno: ' + (state.config.exclude.join(', ') || 'yo‘q') +
      '  |  Timeout: ' + Math.round(state.config.timeoutMs / 1000) + ' s  |  Promotion: ≥ ' + state.config.promotionThreshold;
    $('footer-version').textContent = 'EvoCore v' + state.config.version;
  }

  async function loadDashboard() {
    var status = await api('/api/status');
    $('dash-skills').textContent = status.activeSkillsCount;
    $('dash-skills-sub').textContent = 'jami: ' + status.totalSkillsCount;
    $('dash-memory').textContent = status.activeExperiencesCount;
    $('dash-memory-sub').textContent = 'jami: ' + status.experiencesCount;
    $('dash-history').textContent = status.historyCount;
    $('dash-history-sub').textContent = status.queue.running ? 'navbatda: ' + status.queue.pending + ' (ishlamoqda)' : 'navbat bo‘sh';
    $('dash-cb').textContent = status.circuitBreakerFailures + ' / ' + status.maxConsecutiveFailures;
    $('dash-cb').style.color = status.circuitOpen ? 'var(--danger)' : (status.circuitBreakerFailures > 0 ? 'var(--warning)' : 'var(--success)');
    $('dash-cb-sub').textContent = status.circuitOpen ? 'OCHIQ — sinovlar bloklangan' : 'yopiq (sog‘lom)';
    $('btn-reset-cb').classList.toggle('hidden', !status.circuitOpen && status.circuitBreakerFailures === 0);

    var skills = await api('/api/skills');
    var list = clear($('dash-skills-list'));
    if (skills.length === 0) list.appendChild(el('span', { class: 'muted', text: 'Ko‘nikmalar mavjud emas.' }));
    skills.slice(0, 8).forEach(function (s) {
      list.appendChild(el('div', { style: 'padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: 10px;' }, [
        el('div', {}, [el('strong', { text: s.name }), ' ', el('span', { class: 'badge-tag', text: 'v' + s.version }), ' ', el('span', { class: 'muted', text: s.description || '' })]),
        el('div', { style: 'color: var(--success); font-weight: bold; white-space: nowrap;', text: 'U: ' + s.utility_score })
      ]));
    });
  }

  async function loadMemory() {
    var query = encodeURIComponent($('m-query').value.trim());
    var all = $('m-all').checked ? '&all=1' : '';
    var experiences = await api('/api/memory?limit=200&q=' + query + all);
    var tbody = clear($('memory-table-body'));
    if (experiences.length === 0) tbody.appendChild(emptyRow(7, 'Tajribalar topilmadi.'));
    experiences.forEach(function (e) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [el('span', { class: 'badge-tag', text: e.domain })]),
        el('td', {}, [el('code', { text: e.signature })]),
        el('td', { style: 'font-size: 12px;', text: e.root_cause }),
        el('td', {}, [el('pre', { style: 'padding: 4px;', text: e.winning_fix })]),
        el('td', { text: e.hits + ' / ' + e.regressions }),
        el('td', { style: 'font-weight: bold; color: ' + (e.utility_score >= 0.5 ? 'var(--success)' : 'var(--danger)'), text: e.utility_score }),
        el('td', {}, [el('button', { type: 'button', class: 'btn btn-secondary btn-small', 'data-action': 'regress', 'data-signature': e.signature, text: 'Regressiya' })])
      ]));
    });
  }

  async function loadSkills() {
    var skills = await api('/api/skills?all=1');
    var tbody = clear($('skills-table-body'));
    if (skills.length === 0) tbody.appendChild(emptyRow(6, 'Ko‘nikmalar mavjud emas.'));
    skills.forEach(function (s) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [el('strong', { text: s.name }), el('div', { class: 'muted', style: 'font-size: 12px;', text: s.description || '' })]),
        el('td', {}, [el('span', { class: 'badge-tag', text: s.domain || 'GENERAL' })]),
        el('td', { text: 'v' + s.version }),
        el('td', { style: 'font-weight: bold;', text: s.utility_score }),
        el('td', { text: s.file }),
        el('td', {}, [s.active ? pill('Faol', 'pill-success') : pill('Arxiv', 'pill-muted')])
      ]));
    });
  }

  async function loadHistory() {
    var rows = await api('/api/history?limit=100');
    var tbody = clear($('history-table-body'));
    if (rows.length === 0) tbody.appendChild(emptyRow(7, 'Hali sinovlar o‘tkazilmagan.'));
    rows.forEach(function (t) {
      tbody.appendChild(el('tr', {}, [
        el('td', { style: 'white-space: nowrap;', text: new Date(t.created_at).toLocaleString() }),
        el('td', {}, [actionPill(t.action)]),
        el('td', { text: t.hypothesis }),
        el('td', {}, [t.signature ? el('code', { text: t.signature }) : el('span', { class: 'muted', text: '—' })]),
        el('td', { text: t.exit_code === -1 ? '—' : t.exit_code }),
        el('td', { text: t.score === null ? '—' : t.score }),
        el('td', { text: t.duration_ms === null ? '—' : t.duration_ms + ' ms' })
      ]));
    });
  }

  function readStepForm() {
    var body = {
      taskTitle: $('r-title').value.trim(),
      hypothesis: $('r-hypothesis').value.trim() || $('r-title').value.trim(),
      domain: $('r-domain').value,
      signature: $('r-sig').value.trim(),
      testCommandId: $('r-cmd').value,
      rule: $('r-rule').value.trim(),
      rootCause: $('r-cause').value.trim(),
      verifiedCode: $('r-code').value
    };
    var baseline = $('r-baseline').value.trim();
    if (baseline !== '') body.baselineScore = Number(baseline);
    return body;
  }

  async function runRatchetStep(button) {
    var panel = $('r-result-panel');
    var output = $('r-report-output');
    panel.classList.remove('hidden');
    output.textContent = 'Sinov navbatga qo‘yilmoqda...';
    clear($('r-result-status'));
    button.disabled = true;
    try {
      var queued = await api('/api/ratchet/step', { method: 'POST', body: readStepForm() });
      var job = await waitForJob(queued.jobId, function (j) {
        if (j.status !== 'done') output.textContent = 'Holat: ' + j.status + ' ...';
      });
      if (job.status === 'failed') {
        output.textContent = 'Xatolik: ' + job.error;
        clear($('r-result-status')).appendChild(pill('FAILED', 'pill-danger'));
      } else {
        output.textContent = job.result.report;
        clear($('r-result-status')).appendChild(actionPill(job.result.action));
      }
    } catch (err) {
      output.textContent = 'Xatolik: ' + err.message;
    } finally {
      button.disabled = false;
      loadDashboard().catch(function () {});
    }
  }

  async function runTests(button) {
    var pre = $('terminal-output');
    pre.textContent = 'Testlar navbatga qo‘yilmoqda...';
    button.disabled = true;
    try {
      var queued = await api('/api/tests/run', { method: 'POST', body: { testCommandId: $('t-cmd').value } });
      var job = await waitForJob(queued.jobId, function (j) {
        if (j.status !== 'done') pre.textContent = 'Holat: ' + j.status + ' ...';
      });
      if (job.status === 'failed') pre.textContent = 'Xatolik: ' + job.error;
      else pre.textContent = '[exit code ' + job.result.exitCode + (job.result.timedOut ? ', TIMEOUT' : '') + ', ' + job.result.durationMs + ' ms]\n\n' + (job.result.output || '');
    } catch (err) {
      pre.textContent = 'Xatolik: ' + err.message;
    } finally {
      button.disabled = false;
    }
  }

  function renderIssues(container, issues) {
    issues.forEach(function (iss) {
      container.appendChild(el('div', { class: 'issue' }, [
        el('div', { class: 'issue-title sev-' + iss.severity, text: '[' + iss.severity + '] ' + iss.id + ': ' + iss.title + (iss.line ? ' (qator ' + iss.line + ')' : '') }),
        el('div', { class: 'muted', style: 'font-size: 13px; margin-bottom: 6px;', text: iss.description }),
        el('div', { style: 'font-size: 12px; color: var(--success); font-family: monospace;', text: 'Tavsiya: ' + iss.recommendedFix })
      ]));
    });
  }

  async function runMqlAudit() {
    var data = await api('/api/audit/mql', { method: 'POST', body: { code: $('code-input').value } });
    $('analyze-result-panel').classList.remove('hidden');
    var summary = clear($('analyze-summary'));
    summary.appendChild(data.passed ? pill('PASSED (kritik xatolarsiz)', 'pill-success') : pill('FAILED (kritik xatolar mavjud)', 'pill-danger'));
    summary.appendChild(el('span', { class: 'muted', style: 'margin-left: 10px;', text: 'Jami: ' + data.totalIssues + ' (Kritik: ' + data.criticalCount + ', Ogohlantirish: ' + data.warningCount + ')' }));
    renderIssues(clear($('analyze-details')), data.issues);
  }

  async function runAstScan() {
    var data = await api('/api/scan', { method: 'POST', body: { code: $('code-input').value, ext: $('code-ext').value } });
    $('analyze-result-panel').classList.remove('hidden');
    var summary = clear($('analyze-summary'));
    summary.appendChild(pill(data.ext + ' — ' + data.lineCount + ' qator', 'pill-success'));
    var details = clear($('analyze-details'));
    var rows = data.functions.map(function (f) {
      return el('tr', {}, [el('td', {}, [el('code', { text: f.name })]), el('td', { text: f.params.join(', ') }), el('td', { text: f.type }), el('td', { text: f.line || '' })]);
    });
    if (rows.length === 0) rows.push(emptyRow(4, 'Funksiyalar topilmadi.'));
    details.appendChild(el('div', { class: 'table-wrap' }, [el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Funksiya' }), el('th', { text: 'Parametrlar' }), el('th', { text: 'Turi' }), el('th', { text: 'Qator' })])]),
      el('tbody', {}, rows)
    ])]));
    details.appendChild(el('p', { class: 'muted', text: 'Klasslar: ' + (data.classes.map(function (c) { return c.name; }).join(', ') || 'yo‘q') +
      '  |  Importlar: ' + (data.imports.join(', ') || 'yo‘q') + '  |  Exportlar: ' + (data.exports.join(', ') || 'yo‘q') }));
  }

  var MQL_SAMPLE = [
    'int OnInit() {',
    '   SetIndexBuffer(0, Buffer, INDICATOR_DATA);',
    '   return(0);',
    '}',
    '',
    'int start() {',
    '   int counted = IndicatorCounted();',
    '   OrderSend(Symbol(), OP_BUY, 0.1, Ask, 3, 0, 0);',
    '   return(0);',
    '}'
  ].join('\n');

  var ACTIONS = {
    'refresh': function () { return refreshTab(); },
    'run-step': function (btn) { return runRatchetStep(btn); },
    'run-tests': function (btn) { switchTab('terminal'); return runTests(btn); },
    'audit-mql': function () { return runMqlAudit(); },
    'scan-ast': function () { return runAstScan(); },
    'load-sample': function () { $('code-input').value = MQL_SAMPLE; $('code-ext').value = '.mq4'; },
    'search-memory': function () { return loadMemory(); },
    'rollback': async function () {
      if (!confirm('Scope ichidagi tasdiqlanmagan o‘zgarishlar git stash‘ga olinsinmi? (keyin tiklash mumkin)')) return;
      var data = await api('/api/ratchet/rollback', { method: 'POST', body: {} });
      toast(data.stashRef ? 'Rollback bajarildi. Tiklash: git stash apply ' + data.stashRef : 'Bekor qilinadigan o‘zgarish yo‘q.');
      return loadDashboard();
    },
    'reset-cb': async function () {
      if (!confirm('Circuit breaker qayta tiklansinmi? Avval xatoliklar sababini tekshiring.')) return;
      await api('/api/circuit/reset', { method: 'POST', body: {} });
      toast('Circuit breaker yopildi.');
      return loadDashboard();
    },
    'regress': async function (btn) {
      var sig = btn.getAttribute('data-signature');
      if (!confirm('"' + sig + '" bo‘yicha regressiya qayd etilsinmi?')) return;
      var data = await api('/api/memory/regress', { method: 'POST', body: { signature: sig } });
      toast('Yangi utility: ' + data.newUtility);
      return loadMemory();
    },
    'save-token': async function () {
      state.token = $('auth-token').value.trim();
      try { sessionStorage.setItem('evocore.token', state.token); } catch (e) { /* storage unavailable */ }
      await loadConfig();
      return refreshTab();
    }
  };

  document.addEventListener('click', function (event) {
    var tabBtn = event.target.closest('[data-tab]');
    if (tabBtn) {
      switchTab(tabBtn.getAttribute('data-tab'));
      return;
    }
    var actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;
    var handler = ACTIONS[actionBtn.getAttribute('data-action')];
    if (!handler) return;
    Promise.resolve(handler(actionBtn)).catch(function (err) { toast(err.message, true); });
  });

  $('m-query').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') loadMemory().catch(function (err) { toast(err.message, true); });
  });
  $('m-all').addEventListener('change', function () {
    loadMemory().catch(function (err) { toast(err.message, true); });
  });

  loadToken();
  if (!state.token) showAuth(true);
  loadConfig()
    .then(function () { return loadDashboard(); })
    .catch(function (err) { toast(err.message, true); });
}

export function getFullControlHTML({ nonce = '', version = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EvoCore Studio</title>
  <style>${STYLES}</style>
</head>
<body>

  <aside>
    <div class="brand">🏛️ EvoCore Studio <span>ZERO-FAT</span></div>
    <nav>
      <button type="button" class="nav-btn active" data-tab="dashboard">📊 Asosiy Dashboard</button>
      <button type="button" class="nav-btn" data-tab="ratchet">⚡ Ratchet Evolution</button>
      <button type="button" class="nav-btn" data-tab="analyze">📈 Kod Tahlili (MQL/AST)</button>
      <button type="button" class="nav-btn" data-tab="memory">🧠 MUSE Xotirasi</button>
      <button type="button" class="nav-btn" data-tab="skills">📚 AutoSkill Kutubxonasi</button>
      <button type="button" class="nav-btn" data-tab="history">🕘 Sinovlar Tarixi</button>
      <button type="button" class="nav-btn" data-tab="terminal">💻 Sinov &amp; Terminal</button>
    </nav>
    <div class="sidebar-footer">
      <div id="footer-version">EvoCore v${version}</div>
      <div style="margin-top: 4px;">Faqat localhost · token bilan himoyalangan</div>
    </div>
  </aside>

  <main>
    <header>
      <div id="view-title" style="font-weight: bold; font-size: 18px;">Asosiy Dashboard</div>
      <button type="button" class="btn btn-secondary" data-action="refresh">🔄 Yangilash</button>
    </header>

    <div class="view-content">

      <div id="auth-panel" class="panel hidden">
        <div class="panel-title">🔐 API token kerak</div>
        <p class="muted">Server ishga tushganda terminalda chiqqan havolani oching yoki tokenni shu yerga kiriting.</p>
        <div class="form-group"><label for="auth-token">Token:</label><input type="password" id="auth-token" autocomplete="off"></div>
        <button type="button" class="btn" data-action="save-token">Saqlash</button>
      </div>

      <!-- 1. DASHBOARD -->
      <div data-view="dashboard">
        <div class="grid">
          <div class="card"><div class="card-title">Faol Ko'nikmalar</div><div class="card-val" id="dash-skills" style="color: var(--primary);">0</div><div class="card-sub" id="dash-skills-sub"></div></div>
          <div class="card"><div class="card-title">MUSE Xotira Tajribalari</div><div class="card-val" id="dash-memory" style="color: var(--success);">0</div><div class="card-sub" id="dash-memory-sub"></div></div>
          <div class="card"><div class="card-title">Bajarilgan Sinovlar</div><div class="card-val" id="dash-history">0</div><div class="card-sub" id="dash-history-sub"></div></div>
          <div class="card"><div class="card-title">Circuit Breaker</div><div class="card-val" id="dash-cb">0 / 0</div><div class="card-sub" id="dash-cb-sub"></div></div>
        </div>

        <div class="panel">
          <div class="panel-title">⚡ Tezkor Harakatlar</div>
          <div class="actions">
            <button type="button" class="btn" data-tab="ratchet">🚀 Yangi Ratchet Sinovi</button>
            <button type="button" class="btn btn-secondary" data-tab="analyze">🛡️ MQL Kodini Tekshirish</button>
            <button type="button" class="btn btn-secondary" data-tab="terminal">🧪 Testlarni Yurgizish</button>
            <button type="button" class="btn btn-danger" data-action="rollback">⏪ Rollback (stash)</button>
            <button type="button" class="btn btn-secondary hidden" id="btn-reset-cb" data-action="reset-cb">🔓 Circuit Breaker'ni tiklash</button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">📚 Faol Ko'nikmalar</div>
          <div id="dash-skills-list" class="muted">Yuklanmoqda...</div>
        </div>
      </div>

      <!-- 2. RATCHET -->
      <div data-view="ratchet" class="hidden">
        <div class="panel">
          <div class="panel-title">🚀 Yangi Karpathy Ratchet Sinovi</div>
          <p class="muted" id="r-scope"></p>
          <div class="form-group"><label for="r-title">Topshiriq sarlavhasi:</label><input type="text" id="r-title" maxlength="200" value="MQL5 buffer va hisoblash indeksatsiyasini yaxshilash"></div>
          <div class="form-group"><label for="r-hypothesis">Gipoteza (bo'sh bo'lsa sarlavha olinadi):</label><input type="text" id="r-hypothesis" maxlength="500"></div>
          <div class="form-row">
            <div class="form-group">
              <label for="r-domain">Domen:</label>
              <select id="r-domain">
                <option value="MQL_TRADING">MQL_TRADING (Forex/MetaTrader)</option>
                <option value="MATH_OPTIMIZE">MATH_OPTIMIZE (Algoritmik Matematika)</option>
                <option value="GENERAL">GENERAL (Umumiy Tizim)</option>
              </select>
            </div>
            <div class="form-group"><label for="r-sig">Imzo (signature):</label><input type="text" id="r-sig" maxlength="200" value="MQL5_ARRAY_INDEXING_INVARIANT"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="r-cmd">Test buyrug'i (evocore.config.json):</label><select id="r-cmd"></select></div>
            <div class="form-group"><label for="r-baseline">Baseline score:</label><input type="number" id="r-baseline" step="any" value="0"></div>
          </div>
          <div class="form-group"><label for="r-rule">Yechim qoidasi (bo'sh bo'lsa skill yaratilmaydi):</label><input type="text" id="r-rule" maxlength="4000" value="ArraySetAsSeries(buffer, true) OnInit ichida chaqirilsin"></div>
          <div class="form-group"><label for="r-cause">Ildiz sabab (root cause):</label><input type="text" id="r-cause" maxlength="2000"></div>
          <div class="form-group"><label for="r-code">Tekshirilgan kod namunasi:</label><textarea id="r-code" rows="3">ArraySetAsSeries(rates, true);</textarea></div>
          <button type="button" class="btn" data-action="run-step">⚡ Sinovni Ishga Tushirish</button>
        </div>

        <div class="panel hidden" id="r-result-panel">
          <div class="panel-title">📋 8-Bo'limli Xolis Dalil Hisoboti <span id="r-result-status"></span></div>
          <pre id="r-report-output"></pre>
        </div>
      </div>

      <!-- 3. CODE ANALYSIS -->
      <div data-view="analyze" class="hidden">
        <div class="panel">
          <div class="panel-title">🛡️ MQL4 / MQL5 Auditor va AST Struktura Skaneri</div>
          <div class="form-group"><label for="code-input">Kodni shu yerga kiriting:</label><textarea id="code-input" rows="12" placeholder="int OnInit() { ... }"></textarea></div>
          <div class="form-row">
            <div class="form-group">
              <label for="code-ext">Til (AST uchun):</label>
              <select id="code-ext">
                <option value=".mq5">MQL5 (.mq5)</option>
                <option value=".mq4">MQL4 (.mq4)</option>
                <option value=".js">JavaScript (.js)</option>
                <option value=".ts">TypeScript (.ts)</option>
                <option value=".py">Python (.py)</option>
              </select>
            </div>
          </div>
          <div class="actions">
            <button type="button" class="btn" data-action="audit-mql">🛡️ MQL Audit</button>
            <button type="button" class="btn btn-secondary" data-action="scan-ast">🔍 AST Struktura</button>
            <button type="button" class="btn btn-secondary" data-action="load-sample">📋 Namunaviy MQL4 Kod</button>
          </div>
        </div>
        <div class="panel hidden" id="analyze-result-panel">
          <div class="panel-title">📊 Natija</div>
          <div id="analyze-summary" style="margin-bottom: 15px;"></div>
          <div id="analyze-details"></div>
        </div>
      </div>

      <!-- 4. MUSE MEMORY -->
      <div data-view="memory" class="hidden">
        <div class="panel">
          <div class="panel-title">🧠 MUSE Episodik Traektoriya Xotirasi (SQLite)</div>
          <div class="form-row" style="align-items: end;">
            <div class="form-group"><label for="m-query">Qidiruv (imzo, sabab, yechim):</label><input type="text" id="m-query" placeholder="ArraySetAsSeries"></div>
            <div class="form-group"><label><input type="checkbox" id="m-all"> Arxivlanganlarni ham ko'rsatish (U &lt; 0.5)</label></div>
            <div class="form-group"><button type="button" class="btn btn-secondary" data-action="search-memory">🔎 Qidirish</button></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Domen</th><th>Imzo</th><th>Ildiz Sabab</th><th>Yechim</th><th>Hits/Regr</th><th>Utility</th><th>Amal</th></tr></thead>
              <tbody id="memory-table-body"><tr><td colspan="7">Yuklanmoqda...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 5. AUTOSKILL -->
      <div data-view="skills" class="hidden">
        <div class="panel">
          <div class="panel-title">📚 AutoSkill Ko'nikmalar Katalogi</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Ko'nikma</th><th>Domen</th><th>Versiya</th><th>Utility</th><th>Fayl</th><th>Holat</th></tr></thead>
              <tbody id="skills-table-body"><tr><td colspan="6">Yuklanmoqda...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 6. HISTORY -->
      <div data-view="history" class="hidden">
        <div class="panel">
          <div class="panel-title">🕘 Ratchet Sinovlari Tarixi</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Natija</th><th>Gipoteza</th><th>Imzo</th><th>Exit</th><th>Score</th><th>Davomiylik</th></tr></thead>
              <tbody id="history-table-body"><tr><td colspan="7">Yuklanmoqda...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 7. TERMINAL -->
      <div data-view="terminal" class="hidden">
        <div class="panel">
          <div class="panel-title">💻 Test Konsoli</div>
          <div class="form-row" style="align-items: end;">
            <div class="form-group"><label for="t-cmd">Test buyrug'i:</label><select id="t-cmd"></select></div>
            <div class="form-group"><button type="button" class="btn" data-action="run-tests">🧪 Ishga Tushirish</button></div>
          </div>
          <pre id="terminal-output">Sinovni boshlash uchun tugmani bosing...</pre>
        </div>
      </div>

    </div>
  </main>

  <div id="toast" class="hidden" role="status" aria-live="polite"></div>

  <script nonce="${nonce}">(${clientApp.toString()})();</script>
</body>
</html>`;
}
