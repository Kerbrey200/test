# O'zgarishlar tarixi

## 1.2.0 — avtonom evolve sikli (C varianti)

### ➕ Yangi

- **Evolve sikli** (`core/evolver.js`): kontekst → LLM nomzod → ratchet → xato feedback → qayta urinish, iteratsiya va vaqt byudjeti bilan.
  - Scope'da commit qilinmagan o'zgarish bo'lsa boshlanmaydi, shuning uchun rollback faqat siklning o'z nomzodiga tegadi.
  - Test fayllari, scope tashqarisidagi va istisno qilingan fayllar rad etiladi.
  - Niqoblanadigan qiymat (token, parol, tasodifiy kalit) saqlagan fayllar va `[REDACTED_SECRET]` qaytargan nomzodlar rad etiladi.
  - Bo'sh yoki o'zgarishsiz nomzodlar diskka yozilmaydi. CRLF va oxirgi qator saqlanadi.
  - Sinov istisno tashlasa, asl fayl tiklanadi.
  - Bitta ish = bitta gipoteza: oraliq urinishlar MUSE regressiyasi emas.
- **LLM provayderlari:**
  - `anthropic` — rasmiy `@anthropic-ai/sdk` orqali (loyihaning birinchi npm bog'liqligi, faqat shu provayder tanlanganda yuklanadi). Standart model `claude-opus-5-5`, streaming, `effort: high`. Server tomonidagi refusal fallback (`fallbacks: "default"`) standart holatda yoqilgan. `temperature` yuborilmaydi (API 2026-10-21 rad etadi). Refusal va `max_tokens` aniq xatoga aylanadi.
  - `gemini` — `generateContent` REST. Model va kalit majburiy.
  - `openai` (OpenAI-mos) va `mock` saqlandi.
- **CLI:** `evocore evolve --file ... --instruction ...` (jonli progress, exit 0/2).
- **API:** `POST /api/evolve`. So'rov navbatga qo'yilishdan oldin tekshiriladi. Provayder faqat server muhitidan olinadi, so'rov uni tanlay olmaydi. Vazifalar `progress` hodisalarini qaytaradi. `/api/config` LLM holatini ko'rsatadi.
- **Studio:** "🤖 Avtonom Evolve" bo'limi — jonli iteratsiya jurnali va yakuniy hisobot.
- **CI:** `npm ci` qadami qo'shildi.

## 1.1.0 — xavfsizlik va ishonchlilik bo'yicha qayta qurish

Har bir muammo regressiya testi bilan yopilgan (testlarda `regression: <ID>` deb belgilangan).

### 🔴 Kritik

| ID | Muammo (1.0.0) | Tuzatish |
|---|---|---|
| K1 | Server `0.0.0.0` da, `CORS: *`, `testCommand` HTTP so'rovdan olinardi — istalgan sayt kompyuterda buyruq bajara olardi (RCE) | `127.0.0.1`, har bir ishga tushishda yangi token, Host/Origin tekshiruvi, CORS yo'q, buyruqlar faqat konfiguratsiyadagi ro'yxatdan |
| K2 | `git commit -m "${message}"` — `$(...)` va backtick shell orqali bajarilardi | Git `execFile` orqali, argumentlar massivi bilan chaqiriladi (shell yo'q) |
| K3 | Rollback butun repoda `git checkout -- .` va `git clean -fd` bajarardi — commit qilinmagan ish o'chib ketardi | Faqat scope ichidagi o'zgarishlar `git stash` ga olinadi, `git stash apply` bilan tiklanadi |
| K4 | `git add -A` hamma narsani commit qilardi: foydalanuvchi fayllari, sqlite baza | Faqat tekshirilgan fayllar `--pathspec-from-file` bilan commit qilinadi; `storage/`, `skills/` doim chiqarib tashlanadi |
| K5 | Scorecard commit'dan keyin hisoblanardi; rad etilsa ham commit qolardi, hisobot esa "ROLLED BACK" deb yozardi | Gate commit'dan oldin; hisobot haqiqiy git natijasini yozadi |
| K6 | Testlar haqiqiy repoga commit qilardi, `skills/` va `memory.sqlite` ni o'zgartirardi | Har bir test vaqtinchalik papka/git repoda; CI ishchi daraxt toza qolganini tekshiradi |

### 🟠 Yuqori

| ID | Muammo | Tuzatish |
|---|---|---|
| Y1 | `maskSecrets` oddiy identifikatorlarni buzardi (`calculateMovingAverage20` → `[REDACTED_SECRET]`) | Vendor formatlari, maxfiy nomli o'zgaruvchilar, auth sarlavhalari, URL parollari; tasodifiylik so'z tuzilishi bo'yicha aniqlanadi; regex chiziqli vaqtda ishlaydi |
| Y2 | Circuit breaker faqat ko'rsatkich edi | Ochiq holatda sinov bajarilmaydi; holat SQLite'da saqlanadi; `reset-breaker` |
| Y3 | `NO_CHANGES` regressiya deb hisoblanardi | Faqat haqiqatan sinab ko'rilib, muvaffaqiyatsiz bo'lgan gipoteza regressiya hisoblanadi |
| Y4 | UI va dashboard'da XSS (`innerHTML`) | UI faqat `textContent`, CSP nonce, inline handler'lar yo'q; dashboard to'liq escape + skriptlar taqiqlangan |
| Y5 | `execSync` butun serverni muzlatardi | Async runner + ketma-ket vazifalar navbati; timeout'da jarayonlar daraxti o'ldiriladi |
| Y6 | Skill frontmatter'iga injection; kirill nomlari bo'sh `.md` fayl yaratardi | JSON-quoted qiymatlar; transliteratsiya + hash; slug to'qnashuvidan himoya |
| Y7 | Scorecard so'rovdagi `testsPassed` va boshqa raqamlarga ishonardi | Raqamlar test chiqishidan o'qiladi (node:test, Jest, Vitest, pytest, Mocha, TAP) |
| Y8 | Anti-gaming: refaktor bloklanardi, yangi fayllar tekshirilmasdi | Assertlar soni fayl bo'yicha solishtiriladi; untracked fayllar diff'ga kiradi; skip/only, tavtologiya, test fayl o'chirish va test skriptini o'zgartirish aniqlanadi |

### 🟡 O'rta

| ID | Muammo | Tuzatish |
|---|---|---|
| O1 | Status `LIMIT 5` so'rovidan hisoblanardi; LIKE wildcard'lar ekranlanmagan edi | `COUNT(*)`, `ESCAPE` |
| O2 | LLMBridge Anthropic/Gemini'ni qo'llab-quvvatlaydi deb yozilgan, lekin faqat OpenAI formati bor edi; kalit bo'lmasa jim mock'ga o'tardi | Da'vo tuzatildi (OpenAI-mos endpointlar + mock); noma'lum provider aniq xato beradi; kalitsiz mahalliy serverlar ishlaydi; `Retry-After` bilan qayta urinish, timeout |
| O3 | Regressiyadan keyin ham skill faol qolaverardi | Skill utility'si MUSE bilan sinxronlanadi, `< 0.5` bo'lsa arxivlanadi |
| O4 | AST: Python `-> type`, `async def` topilmasdi; izoh/string ichidagi kod funksiya deb hisoblanardi | Izoh/string tozalash, muvozanatli qavslar, qator raqamlari, TS/generator/arrow qo'llab-quvvatlash |
| O5 | MQL: izohlar tekshirilardi, `Digits()` xato deb belgilanardi, MQL4 qoldiqlarining ko'pi topilmasdi | Argumentlar soni bo'yicha signatura, 12 ta qoida, qator raqamlari |
| O6 | Hajm limiti yo'q edi; `--port abc` → NaN; noma'lum buyruqda exit 0; stack trace chiqardi | 1 MB limit (413), argumentlar tekshiriladi, to'g'ri exit kodlar, tushunarli xato xabarlari |
| O7 | CRLF/LF diff'lari; avtomatik yaratilgan fayllar git'da kuzatilardi; `engines` yo'q edi | `.gitattributes`, `storage/` e'tiborsiz qoldiriladi, `engines: node >= 22.13` |

### ➕ Qo'shimchalar

- `evocore.config.json`: scope, istisnolar, test buyruqlari ro'yxati, limitlar (tekshiriladi).
- CLI: `trial`, `rollback`, `history`, `reset-breaker`, `--json`, `skills --all`, `memory <so'z>`.
- Studio: sinovlar tarixi, AST skaneri, xotirada qidiruv, circuit breaker'ni tiklash, mobil ko'rinish.
- API: `/api/config`, `/api/history`, `/api/jobs/:id`, `/api/scan`, `/api/circuit/reset`, `/api/health`.
- MUSE: sxema migratsiyalari (eski bazalar avtomatik yangilanadi), trayektoriyalar, WAL.
- CI: Linux + Windows, Node 22 + 24; Playwright UI smoke-test (`npm run test:ui`).

