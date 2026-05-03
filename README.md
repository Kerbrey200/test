# Tashkilot Boshqaruvi

Professional organization management system.

## Deployment Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (latest LTS version)
- NPM or PNPM

### 1. Installation
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and configure your environment variables:
```bash
# Linux / Windows (Git Bash/PowerShell)
cp .env.example .env
# Edit .env and add required environment variables
```

### 3. Build
```bash
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
1. **Using Command Prompt/PowerShell**:
   Open a terminal in the project directory and run:
   ```bash
   npm start
   ```
   *(Note: This terminal must remain open. For production, consider using a service manager like NSSM to run it as a background service.)*

2. **Using PM2 (Alternative)**:
   PM2 is also supported on Windows.
   ```bash
   npm install -g pm2
   pm2 start npm --name "tashkilot-boshqaruvi" -- start
   ```

The application will run on port 3000.
