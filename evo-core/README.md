# 🏛️ EvoCore: Tri-Core Autonomous Evolution Engine

**EvoCore** — bu to'liq "Zero-Fat" (tashqi og'ir bog'liqliklarsiz), sof Node.js (v20+) va mahalliy SQLite asosida qurilgan, o'z-o'zini rivojlantiruvchi mustaqil dasturiy dvigatel.

U uchta zamonaviy AI arxitekturasini yagona yopiq evolyutsion zanjirga birlashtiradi:
1. **Karpathy Autoresearch (Ratchet Engine):** Qat'iy metrika va vaqt chegarasi, sinov o'tsa `git commit`, aks holda darhol `git rollback`.
2. **MUSE (Episodic Trajectory Memory):** Har bir sinovdan so'ng ildiz sabab (root cause) va ishlagan yechimni ajratib olib, SQLite xotirasiga yozish.
3. **AutoSkill (Lifelong Skill Distiller):** Muvaffaqiyatli darslarni modulli va versiyalangan `Skill.md` fayllariga aylantirib, kelajakdagi vazifalarda qayta ishlatish.

---

## 🚀 Tezkor Boshlash (CLI)

```bash
# Holatni tekshirish
node bin/evocore.js status

# Faol ko'nikmalar ro'yxati
node bin/evocore.js skills

# Saqlangan tajribalar xotirasi
node bin/evocore.js memory

# Barcha testlarni yurgizish
npm test
```

---

## 📐 Arxitektura

```
evo-core/
  ├── bin/
  │     └── evocore.js               # CLI boshqaruv paneli
  ├── core/
  │     ├── gatekeeper.js            # Anti-gaming, Shannon Entropy va 100-ballik Scorecard
  │     ├── ast_scanner.js           # JS, Python, MQL4/MQL5 funksiyalarini sintaksis tahlili
  │     ├── ratchet_engine.js        # Karpathy Loop (Sandbox run -> Git commit/rollback)
  │     ├── muse_memory.js           # SQLite asosidagi doimiy traektoriya xotirasi
  │     ├── autoskill_distiller.js   # Ko'nikmalarni Skill.md ga sintez qilish va versiyalash
  │     ├── reporter.js              # 8-bo'limli xolis dalillar hisoboti
  │     ├── evocore.js               # Boshqaruvchi orkestrator klassi
  │     └── index.js                 # Asosiy eksportlar
  ├── storage/
  │     └── memory.sqlite            # Native SQLite bazasi (Zero-Fat)
  ├── skills/                        # Yaratilgan va doimiy yangilanuvchi Skill.md fayllari
  └── tests/                         # 100% yashil testlar to'plami (15/15 pass)
```

---

## 🛡️ Alauddin Invariantlari

* **Layer 0 Zero-Hallucination:** Hech qanday taxmin yo'q — faqat `exit code 0` va real test loglari dalil hisoblanadi.
* **Utility Score:** Har bir tajriba $U = \frac{h - 2z}{n}$ formulasi bilan nazorat qilinadi ($U < 0.5$ bo'lsa dars arxivlanadi).
* **Anti-Gaming Guard:** Assertlarni o'chirish yoki testlarni aldash urinishlari darhol fosh qilinadi va bekor qilinadi.
* **Secret Masking:** $H \ge 3.6$ bit bo'lgan API tokenlar va maxfiy ma'lumotlar avtomatik `[REDACTED_SECRET]` qilib berkitiladi.
