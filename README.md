# Tashkilot Boshqaruvi

Professional organization management system.

## Deployment Instructions

To run this application on a production server:

1. **Prerequisites**: Ensure [Node.js](https://nodejs.org/) (latest LTS version) is installed on the server.

2. **Installation**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Copy `.env.example` to `.env` and configure your environment variables:
   ```bash
   cp .env.example .env
   # Edit .env and add required environment variables
   ```

4. **Build**:
   ```bash
   npm run build
   ```

5. **Start**:
   ```bash
   npm start
   ```

The application will now run on port 3000.
