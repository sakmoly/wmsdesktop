# WMS API Deployment Guide

## Building the Executable

### Prerequisites

1. Install Node.js 18 or higher
2. Install dependencies: `npm install`
3. Install build tools: The build process will install `esbuild` and `pkg` automatically

### Build Commands

```bash
# Install dependencies (if not already installed)
npm install

# Build the executable (bundles code + creates .exe)
npm run build:exe

# Create deployment package (creates deployment folder with all files)
npm run package
```

### Manual Build Steps

1. **Bundle the code:**
   ```bash
   npm run build
   ```
   This creates `dist/server.js` (bundled single file)

2. **Create executable:**
   ```bash
   pkg dist/server.js --targets node18-win-x64 --output dist/wms-api.exe
   ```

3. **Package for deployment:**
   ```bash
   node package-deployment.js
   ```

## Deployment Package Contents

After running `npm run package`, you'll have a `deployment` folder containing:

- **wms-api.exe** - Main executable (standalone, no Node.js required)
- **.env.template** - Configuration template
- **README.txt** - User documentation
- **install.bat** - Installation script for Windows
- **start-server.bat** - Script to start the server
- **setup-firewall.bat** - Script to configure Windows Firewall

## Client Deployment Instructions

### Step 1: Copy Deployment Folder

Copy the entire `deployment` folder to the client machine.

### Step 2: Install

1. Open the `deployment` folder
2. Double-click `install.bat`
3. Follow the prompts to create and configure `.env` file

### Step 3: Configure

Edit the `.env` file with:
- Database connection details
- Server port (if different from 3000)
- JWT secret key

### Step 4: Start Server

1. Double-click `start-server.bat` to start the server
2. Or run `wms-api.exe` directly from command line

### Step 5: Verify

Open browser: http://localhost:3000/health

Should see: `{"status":"ok","message":"WMS API Server is running"}`

## Configuration File (.env)

Required settings:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_database

# Server
PORT=3000
HOST=0.0.0.0

# Security
JWT_SECRET=your_secret_key
```

## Network Access

The server runs on `0.0.0.0:3000` by default, making it accessible from:
- Local machine: http://localhost:3000
- Network: http://YOUR_IP:3000

To allow network access, run `setup-firewall.bat` (requires Administrator).

## Troubleshooting

### Port Already in Use

Change `PORT` in `.env` file, or kill the process using port 3000:

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Database Connection Failed

1. Verify database is running
2. Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
3. Ensure database user has proper permissions
4. Test connection from the machine running the API

### Executable Won't Start

1. Check if `.env` file exists in same folder as `wms-api.exe`
2. Check Windows Event Viewer for errors
3. Try running from command line to see error messages

### Firewall Issues

1. Run `setup-firewall.bat` as Administrator
2. Or manually add firewall rule for port 3000

## Running as Windows Service (Optional)

For production, you may want to run as a Windows Service. Use tools like:
- **NSSM** (Non-Sucking Service Manager)
- **node-windows** (npm package)

Example with NSSM:
```bash
nssm install WMS-API "C:\path\to\wms-api.exe"
nssm set WMS-API AppDirectory "C:\path\to\deployment"
nssm start WMS-API
```

## File Structure

```
deployment/
├── wms-api.exe          # Standalone executable
├── .env                 # Configuration (created by install.bat)
├── .env.template        # Configuration template
├── README.txt           # User documentation
├── install.bat          # Installation script
├── start-server.bat     # Start server script
└── setup-firewall.bat   # Firewall setup script
```

## Build Troubleshooting

### Build Fails

1. Ensure Node.js 18+ is installed
2. Run `npm install` to install all dependencies
3. Check that `esbuild` and `pkg` are installed

### Executable Too Large

The executable includes Node.js runtime (~50-70MB). This is normal for standalone executables.

### ES Module Issues

If you see ES module errors, ensure:
- All imports use `.js` extension
- Package.json has `"type": "module"`
- Build script properly bundles all files

## Updates

To update the deployed API:

1. Build new executable: `npm run build:exe`
2. Replace `wms-api.exe` in deployment folder
3. Restart the server

**Note:** `.env` file is preserved, no need to reconfigure.

## Support

For deployment issues:
1. Check logs in console output
2. Verify `.env` configuration
3. Test database connectivity
4. Check firewall settings