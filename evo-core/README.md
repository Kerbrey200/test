# 🏛️ EvoCore: Tri-Core Autonomous Evolution Engine

**EvoCore** — sof Node.js va mahalliy SQLite asosida qurilgan, o'z-o'zini rivojlantiruvchi dasturiy dvigatel. Yadro tashqi paketlarsiz ishlaydi ("Zero-Fat"). Yagona istisno: Claude provayderi uchun rasmiy Anthropic SDK. U uchta g'oyani yagona yopiq zanjirga birlashtiradi:

1. **Karpathy Ratchet** — o'zgarish faqat haqiqiy testlar va metrika tasdiqlasa commit qilinadi, aks holda tiklanadigan rollback.
2. **MUSE xotirasi** — har bir sinovdan ildiz sabab, ishlagan yechim va trayektoriya SQLite'ga yoziladi.
3. **AutoSkill** — tasdiqlangan darslar versiyalangan `Skill.md` fayllariga aylanadi va utility pasaysa arxivlanadi.

Ustiga: **avtonom evolve sikli**. Unda LLM (OpenAI-mos, Claude, Gemini yoki offline mock) kod nomzodini yozadi, ratchet uni tekshiradi, muvaffaqiyatsiz bo'lsa xato LLM'ga qaytariladi. Shuningdek: MQL4 → MQL5 savdo kodi auditori, JS/TS/Python/MQL AST skaneri, veb boshqaruv paneli (EvoCore Studio) va offline HTML dashboard.

---

## ⚙️ Talablar

- **Node.js ≥ 22.13** (`node:sqlite` bayroqsiz ishlashi uchun)
- **git ≥ 2.26** (`--pathspec-from-file` uchun)
- Yagona npm bog'liqlik — rasmiy **`@anthropic-ai/sdk`**. U faqat `anthropic` provayderi tanlanganda yuklanadi, qolgan hamma narsa `npm install` siz ham ishlaydi.

## 🚀 Tezkor boshlash

```bash
cd evo-core
npm install                   # faqat Claude (anthropic) provayderi uchun kerak
npm test                      # 138 ta test, hammasi vaqtinchalik papkalarda
node bin/evocore.js --help    # CLI yordami
node bin/serve.js             # Web Studio (havola terminalda chiqadi)
```

Loyihangiz ustida ishlatish uchun EvoCore'ni **o'sha loyiha ildizida** ishga tushiring va `evocore.config.json` yarating (namuna: [`evocore.config.example.json`](evocore.config.example.json)).

---

## 🔄 Ratchet qanday ishlaydi

Har bir sinov qat'iy tartibda o'tadi. Biror bosqich o'tmasa, keyingisiga o'tilmaydi va o'zgarishlar **git stash**'ga olinadi (o'chirilmaydi):

```
scope diff ─► anti-gaming audit ─► maxfiy ma'lumot tekshiruvi ─► test (async, timeout)
   ─► test natijasini o'qish (TAP/Jest/pytest/...) ─► metrika ≥ baseline
   ─► 100 ballik scorecard (≥ 75) ─► yaxlitlik (test fayllarni o'zgartirmaganmi)
   ─► COMMIT (faqat tekshirilgan fayllar)   |   ROLLBACK (git stash, tiklanadi)
   ─► MUSE xotira + AutoSkill + 8 bo'limli hisobot
```

| Natija | Ma'nosi |
|---|---|
| `COMMITTED` | Barcha tekshiruvlar o'tdi, faqat scope'dagi tekshirilgan fayllar commit qilindi |
| `ROLLED_BACK` | Test, dalil yoki metrika o'tmadi |
| `REJECTED_GATE` | Scorecard yetmadi yoki test paytida fayllar o'zgartirildi |
| `REJECTED_GAMING` | Assert o'chirilgan, test skip qilingan, tavtologik assert, test skripti o'zgartirilgan |
| `REJECTED_SECURITY` | Diff'ga token/parol qo'shilgan |
| `NO_CHANGES` | Scope'da o'zgarish yo'q (regressiya hisoblanmaydi) |
| `CIRCUIT_OPEN` | Ketma-ket xatolar chegarasiga yetildi, `reset-breaker` kerak |

Rollback qilingan ishni qaytarish: `git stash apply <stashRef>` (havola hisobotda ko'rsatiladi).

**Scorecard faqat dalilga tayanadi**: test sonlari buyruq chiqishidan o'qiladi (node:test, Jest, Vitest, pytest, Mocha, TAP). Format tanilmasa, exit kodi yagona tekshiruv sifatida olinadi. Chaqiruvchi yuborgan `testsPassed` kabi raqamlar e'tiborga olinmaydi.

---

## 🤖 Avtonom Evolve (LLM + Ratchet)

```
kontekst (skill'lar, MUSE tajribalari) ─► LLM nomzod fayl ─► faylga yozish
   ─► to'liq ratchet sinovi (audit → test → gate) ─► COMMITTED ? tugadi
   : xato xulosasi (test chiqishi, gate sabablari) LLM'ga qaytariladi ─► keyingi iteratsiya
```

```bash
node bin/evocore.js evolve --file src/calc.js --instruction "calculate() 100 qaytarsin" \
  --test "npm test" --iterations 3 --provider anthropic --signature CALC_100 --rule "..."
```

Xavfsizlik qoidalari:
- **Boshlashdan oldin** scope'da commit qilinmagan o'zgarish bo'lmasligi kerak. Shunday qilib rollback faqat siklning o'z nomzodini stash'ga oladi, sizning ishingizga tegmaydi.
- Maqsad fayl scope ichida, istisnolardan tashqarida bo'lishi kerak va **test fayli bo'lmasligi** kerak.
- Faylda LLM'ga yuborishdan oldin niqoblanadigan qiymat (token, parol, tasodifiy kalit) bo'lsa, sikl rad etadi. Aks holda javob asl qiymatni buzar edi.
- Bo'sh, o'zgarishsiz yoki `[REDACTED_SECRET]` saqlagan nomzodlar diskka yozilmaydi.
- Sikl quyidagi hollarda to'xtaydi: muvaffaqiyat, ochiq circuit breaker, rollback xatosi, LLM sozlama xatosi (401/403/400) yoki iteratsiya/vaqt byudjeti tugashi.
- Bitta evolve ishi bitta gipoteza hisoblanadi: butun ish muvaffaqiyatsiz tugasa, MUSE'ga **bitta** regressiya yoziladi.

Studio'da **🤖 Avtonom Evolve** bo'limi jonli iteratsiya jurnali bilan ishlaydi. LLM provayderi faqat server muhitidan olinadi, so'rov uni tanlay olmaydi.

### LLM provayderlari

| `EVO_PROVIDER` | Protokol | Standart model | Izoh |
|---|---|---|---|
| `mock` (standart) | — | — | Offline, deterministik (testlar va demo uchun) |
| `openai` | OpenAI-mos `/chat/completions` (fetch) | `gpt-4o-mini` | OpenAI, DeepSeek, OpenRouter, Ollama, LM Studio, vLLM. Mahalliy serverlar uchun kalit shart emas |
| `anthropic` | Rasmiy `@anthropic-ai/sdk` (streaming) | `claude-opus-5-5` | `effort: high`, server tomonidagi refusal fallback (`fallbacks: "default"`) yoqilgan; kalit `EVO_API_KEY` yoki SDK'ning o'zi (`ANTHROPIC_API_KEY`, `ant auth login`) |
| `gemini` | `generateContent` REST (fetch) | — (`EVO_MODEL` majburiy) | `EVO_API_KEY` majburiy |

Boshqa muhit o'zgaruvchilari: `EVO_MODEL`, `EVO_BASE_URL`, `EVO_API_KEY`, `EVO_EFFORT` (Claude uchun: `low`…`max`, `none` — yubormaslik), `EVO_ANTHROPIC_FALLBACKS=0` (Claude fallback'ni o'chirish).

> Claude refusal fallback: agar Claude xavfsizlik klassifikatori so'rovni rad etsa, API uni server tomonida Anthropic tavsiya qilgan boshqa modelda qayta ishlaydi. Shuning uchun u standart holatda yoqilgan. Kerak bo'lmasa, `EVO_ANTHROPIC_FALLBACKS=0` bilan o'chiring.

---

## 🖥️ CLI

```bash
node bin/evocore.js status                    # holat (--json ham bor)
node bin/evocore.js skills --all              # barcha ko'nikmalar, arxivlanganlar bilan
node bin/evocore.js memory ArraySetAsSeries   # MUSE qidiruvi
node bin/evocore.js history                   # sinovlar tarixi
node bin/evocore.js scan src/app.ts           # AST tahlili, qator raqamlari bilan
node bin/evocore.js audit expert.mq4          # MQL audit (kritik xatoda exit 2 — CI uchun)
node bin/evocore.js trial --test "npm test" --hypothesis "..." --signature SIG --rule "..."
node bin/evocore.js evolve --file src/a.js --instruction "..." --test "npm test" --provider mock
node bin/evocore.js rollback                  # scope o'zgarishlarini stash'ga olish
node bin/evocore.js reset-breaker             # circuit breaker'ni tiklash
node bin/evocore.js dashboard --out report.html
```

Exit kodlar: `0` muvaffaqiyat, `1` xatolik, `2` salbiy natija (audit yoki sinov o'tmadi).

## 🌐 EvoCore Studio (veb panel)

```bash
node bin/serve.js [--port 3777] [--host 127.0.0.1]
```

- Server **faqat 127.0.0.1** da ochiladi. Terminalda chiqqan havolada shu sessiya uchun **API token** bor. Token brauzerda sessiya xotirasiga olinadi va manzil satridan o'chiriladi.
- Doimiy token kerak bo'lsa: `EVO_TOKEN=... node bin/serve.js`.
- Test buyruqlari **faqat** `evocore.config.json` dagi `testCommands` ro'yxatidan tanlanadi. So'rov orqali yuborilgan buyruq rad etiladi.
- Bo'limlar: Dashboard, Ratchet, Avtonom Evolve (jonli jurnal), Kod tahlili (MQL + AST), MUSE xotirasi, AutoSkill, Sinovlar tarixi, Terminal.

## 🧩 Sozlamalar (`evocore.config.json`)

| Kalit | Standart | Tavsif |
|---|---|---|
| `scope` | `["."]` | Ratchet tekshiradigan, commit va rollback qiladigan yo'llar |
| `exclude` | `["node_modules"]` | Hech qachon tegilmaydigan yo'llar (`storage/`, `skills/` doim qo'shiladi) |
| `testCommands` | `{"default": "npm test"}` | Ruxsat berilgan test buyruqlari (id → buyruq) |
| `timeoutMs` | `120000` | Test vaqt chegarasi (jarayonlar daraxti to'xtatiladi) |
| `maxOutputBytes` | `1048576` | Saqlanadigan chiqish hajmi (oxirgi qismi) |
| `maxConsecutiveFailures` | `3` | Circuit breaker chegarasi (SQLite'da saqlanadi) |
| `strictImprovement` | `false` | `true`: score baseline'dan **katta** bo'lishi shart |
| `maxDiffLines` | `800` | Bundan katta diff maintainability ballini kamaytiradi |
| `promotionThreshold` | `75` | Commit uchun minimal scorecard bali |
| `server.host` / `server.port` | `127.0.0.1` / `3777` | Web Studio manzili |

LLM provayderi muhit o'zgaruvchilari orqali sozlanadi (yuqoridagi "LLM provayderlari" jadvaliga qarang).

---

## 🛡️ MQL4 → MQL5 auditori

Izohlar va string'lar e'tiborga olinmaydi. Funksiyalar argumentlar soni bo'yicha ajratiladi, shuning uchun to'g'ri MQL5 kodi (`iMA(6 arg)`, `OrderSend(request, result)`, `Digits()`, `trade.OrderModify`) xato deb belgilanmaydi.

| ID | Daraja | Tekshiruv |
|---|---|---|
| MQL5-01 | CRITICAL | `IndicatorCounted()` |
| MQL5-02 | WARNING / CRITICAL | Buferda `ArraySetAsSeries` yo'q (har bir bufer alohida; MQL4 uslubidagi teskari sikl bo'lsa CRITICAL) |
| MQL5-03 | WARNING / INFO | `OnInit()` `INIT_SUCCEEDED` qaytarmaydi (`return(0)` — INFO) |
| MQL5-04 | CRITICAL | MQL4 `OrderSend(...)` (7+ argument) yoki `OP_BUY`/`OP_SELL` |
| MQL5-05 | WARNING | `Digits` / `Point` / `Bars` o'zgaruvchilari |
| MQL5-06 | CRITICAL | `Ask` / `Bid` |
| MQL5-07 | CRITICAL | `Close[]`, `Open[]`, `High[]`, `Low[]`, `Time[]`, `Volume[]` |
| MQL5-08 | CRITICAL | MQL4 order pool: `OrderClose`, `OrderTicket`, `SELECT_BY_POS`, ... |
| MQL5-09 | CRITICAL | Indikatorning MQL4 signaturasi (`iMA` 7 arg, `iRSI` 5 arg, ...) |
| MQL5-10 | WARNING | MQL5 indikator handle'i `double` ga yozilgan |
| MQL5-11 | CRITICAL | `start()` / `init()` / `deinit()` |
| MQL5-12 | CRITICAL | `MarketInfo`, `IndicatorBuffers`, `SetIndexStyle`, ... |

---

## 📐 Arxitektura

```
evo-core/
  bin/
    evocore.js            CLI (parseArgs, --json, exit kodlar)
    serve.js              Web Studio ishga tushiruvchi
  core/
    evocore.js            Orkestrator: kontekst, gate, MUSE/AutoSkill, hisobot
    evolver.js            Avtonom evolve sikli: LLM nomzod → ratchet → feedback
    ratchet_engine.js     Ratchet: audit → test → dalil → gate → commit/stash
    git_workspace.js      Shell'siz git: scope, diff (untracked bilan), commit, stash
    runner.js             Async buyruq: timeout, jarayon daraxtini o'ldirish, chiqish limiti
    evidence.js           Test natijalarini o'qish (node:test, Jest, Vitest, pytest, Mocha, TAP)
    gatekeeper.js         Maxfiy ma'lumotlarni yashirish, anti-gaming, scorecard, utility
    config.js             evocore.config.json yuklash va tekshirish
    muse_memory.js        SQLite xotira: migratsiyalar, trayektoriyalar, dvigatel holati
    autoskill_distiller.js  Skill.md: xavfsiz frontmatter, versiya, arxivlash
    ast_scanner.js        JS/TS/Python/MQL struktura skaneri
    mql_validator.js      MQL4 → MQL5 auditori
    source_utils.js       Izoh/string tozalash, qavslar, argumentlar
    llm_bridge.js         LLM: OpenAI-mos, Claude (rasmiy SDK), Gemini, mock
    server.js             HTTP API: token, Host/Origin tekshiruvi, JSON limit
    job_queue.js          Ketma-ket vazifalar navbati (progress hodisalari bilan)
    web_ui.js             EvoCore Studio (CSP nonce, textContent)
    dashboard_generator.js  Offline HTML hisobot (escape + skriptlar taqiqlangan)
    reporter.js           8 bo'limli dalil hisoboti
  skills/                 Distillangan ko'nikmalar
  storage/                Runtime ma'lumotlari (git'da emas)
  tests/                  node:test to'plami + tests/ui (Playwright smoke)
```

## 🛡️ Invariantlar

- **Zero-Hallucination:** commit faqat exit kodi va o'qilgan test dalili asosida qilinadi.
- **Utility Score:** `U = (h − 2z) / n`. `U < 0.5` bo'lsa tajriba va ko'nikma arxivlanadi (o'chirilmaydi).
- **Anti-Gaming:** assertlarni kamaytirish, testlarni skip/only qilish, `assert.ok(true)`, test faylini o'chirish, test skriptini o'zgartirish va test vaqtida fayllarni qayta yozish rad etiladi.
- **Secret Masking:** vendor tokenlari, maxfiy nomli o'zgaruvchilar, `Authorization` sarlavhalari, URL parollari va tasodifiy tokenlar `[REDACTED_SECRET]` qilinadi. Dastur identifikatorlari va yo'llar buzilmaydi.
- **Sizning ishingiz xavfsiz:** ratchet scope tashqarisidagi fayllarga tegmaydi, oldindan staged qilingan ishingizni commit qilmaydi, rollback esa har doim `git stash` orqali tiklanadi.

## 🧪 Testlar

```bash
npm test               # barcha testlar (har biri vaqtinchalik papka/git repoda)
npm run test:coverage  # kod qamrovi
npm run test:ui        # Chromium'da UI smoke-test (Playwright o'rnatilgan bo'lsa)
```

CI (`.github/workflows/evo-core.yml`) testlarni Linux va Windows'da, Node 22 va 24 bilan ishga tushiradi. U test to'plami ishchi daraxtni o'zgartirmaganini ham tekshiradi.

O'zgarishlar tarixi: [CHANGELOG.md](CHANGELOG.md).
