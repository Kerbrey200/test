# Tashkilot Boshqaruvi

Professional organization management system.

## Login va parollar

Barcha foydalanuvchilar `data.json` faylida saqlanadi. Hamma demo akkauntlarning paroli: **`123456`**

| Rol | Email (login) | Parol | Nima qila oladi |
|---|---|---|---|
| Administrator | `naigaks2021@gmail.com` | `123456` | Foydalanuvchilar, obyektlar, materiallar, Excel import; hamma bosqichda tasdiqlash |
| Prorab (FOREMAN) | `prorab@demo.uz` | `123456` | Zayavka va M-29 hisobot yaratish, nakladnoy yuborish/qabul qilish |
| Sklad (WAREHOUSE) | `sklad@demo.uz` | `123456` | Nakladnoy yuborish/qabul qilish |
| Snabjeniye (SUPPLY) | `snab@demo.uz` | `123456` | Shet-faktura kirimi, nakladnoy, zayavkalarni ko'rish |
| PTO | `pto@demo.uz` | `123456` | Zayavka (2-bosqich) va hisobot (1-bosqich) tasdiqlash |
| Bosh muhandis (CHIEF_ENGINEER) | `muhandis@demo.uz` | `123456` | Zayavka (1-bosqich) va hisobot (yakuniy) tasdiqlash, ombor inventari |
| Buxgalteriya (ACCOUNTING) | `buxgalter@demo.uz` | `123456` | Hisobotlarni ko'rish |
| Rahbariyat (MANAGEMENT) | `rahbar@demo.uz` | `123456` | Zayavkani yakuniy tasdiqlash |

**Ish oqimlari:**
- **Zayavka:** Prorab → Bosh muhandis → PTO → Rahbariyat → `APPROVED`
- **M-29 hisobot:** Prorab → PTO → Bosh muhandis (tasdiqlanganda prorab qoldig'idan ayiriladi)
- **Kirim:** Shet-faktura (Snabjeniye) yoki Excel import (Admin) → tanlangan Sklad/Snabjeniye xodimi hisobiga
- **Nakladnoy:** Yuboruvchi yaratadi → qabul qiluvchi tasdiqlaydi (yuboruvchida qoldiq yetarli bo'lishi shart)

> **Diqqat:** Demo akkauntlar faqat sinov uchun. Haqiqiy ishga tushirishdan oldin ularni o'chiring yoki parollarini
> **Foydalanuvchilar** sahifasidan almashtiring.

## Deployment Instructions

> **Vercel / Netlify kabi statik yoki serverless hostinglarda ishlamaydi.** Ilova doimiy ishlab turadigan
> Node.js serveri (`server.ts`) va diskdagi `data.json` fayliga tayanadi. Vercel faqat frontendni joylaydi,
> shuning uchun login `"The page could not be found"... is not valid JSON` xatosini beradi, ma'lumotlar ham saqlanmaydi.
> Doimiy serverdan foydalaning: Windows Server, Linux VPS yoki doimiy diskli (volume) Railway / Render / Fly.io.

### Prerequisites
- [Node.js](https://nodejs.org/) 22.18 yoki undan yangi (tavsiya: eng so'nggi LTS)
- NPM or PNPM

### Node.js Setup

If Node.js is not installed, follow the instructions for your OS:

#### Windows Server 2019/2022+ (PowerShell)
1. **Open PowerShell as Administrator.**
2. **Install Node.js (Winget):**
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```
   *(After installation, close and reopen PowerShell to refresh the PATH).*

#### Windows Server 2012 R2 / Legacy Windows
1. Visit the [official Node.js website](https://nodejs.org/).
2. Download the **LTS (Long Term Support)** Windows Installer (.msi file).
3. Run the installer and follow the on-screen instructions (ensure "Add to PATH" option is checked).
4. After installation, close and reopen your terminal.

#### Verify Installation (All)
   ```powershell
   node -v
   npm -v
   ```

### 1. Installation
```powershell
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and configure your environment variables:
```powershell
cp .env.example .env
# Edit .env and add required environment variables
```

| O'zgaruvchi | Vazifasi |
|---|---|
| `PORT` | Server porti (standart `3000`) |
| `DATA_FILE` | Ishchi ma'lumotlar fayli. Loyiha papkasidan **tashqarida** bo'lishi tavsiya etiladi (masalan `C:\tashkilot-data\data.json`), shunda `git pull` ma'lumotlarni hech qachon ustiga yozmaydi. Birinchi ishga tushishda repodagi `data.json` (demo foydalanuvchilar) nusxalanadi. Ko'rsatilmasa, loyiha ichidagi `data.json` ishlatiladi. |

> Railway / Render / Fly.io'da `DATA_FILE` ni ulangan doimiy diskka (volume) yo'naltiring, masalan `/data/data.json`,
> aks holda har qayta deploy'da ma'lumotlar o'chib ketadi.

### 3. Build
```powershell
npm run build
```

`npm start` production rejimida `dist/` ni beradi, shuning uchun har kod yangilanishidan keyin avval `npm run build` qiling.
Ishlab chiqish (development) uchun: `npm run dev`.

### 4. Running the Application

#### On Linux (Recommended: PM2)
To keep the application running in the background:

1. Install PM2:
   ```bash
   npm install -g pm2
   ```
2. Start the application:
   ```bash
   pm2 start npm --name "tashkilot-boshqaruvi" -- start
   ```
3. Save the process list:
   ```bash
   pm2 save
   ```

#### On Windows Server
1. **Using PowerShell**:
   Open a terminal in the project directory and run:
   ```powershell
   npm start
   ```
   *(Note: This terminal must remain open. For production, consider using a service manager like NSSM to run it as a background service.)*

2. **Using PM2 (Alternative Rendering)**:
   PM2 is also supported on Windows.
   ```powershell
   npm install -g pm2
   pm2 start npm --name "tashkilot-boshqaruvi" -- start
   ```

The application will run on port `PORT` (default 3000).
