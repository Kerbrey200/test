# Tashkilot Boshqaruvi

Professional organization management system.

## Deployment Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (latest LTS version)
- NPM or PNPM

### Windows Server (PowerShell) Setup

If Node.js is not installed, you can use PowerShell to install it:

1. **Open PowerShell as Administrator.**
2. **Install Node.js (Winget):**
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```
   *(After installation, close and reopen PowerShell to refresh the PATH).*
3. **Verify Installation:**
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

### 3. Build
```powershell
npm run build
```

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

The application will run on port 3000.
