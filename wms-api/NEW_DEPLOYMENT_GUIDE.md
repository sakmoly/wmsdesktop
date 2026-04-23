# WMS API Server - New Deployment Guide

## 📦 Overview

This guide will help you create a fresh deployment package for the WMS API server that can be distributed to production or client environments.

---

## 🚀 Quick Start - Create New Deployment

### Step 1: Install Dependencies

```bash
cd wms-api
npm install
```

### Step 2: Build the Executable

```bash
# This will:
# 1. Bundle all code into a single file
# 2. Create a standalone Windows executable (wms-api.exe)
# 3. Package everything into deployment/ folder
npm run package
```

### Step 3: Verify Deployment Package

After building, check the `deployment/` folder contains:
- ✅ `wms-api.exe` - Main executable
- ✅ `.env.template` - Configuration template
- ✅ `README.txt` - User documentation
- ✅ `install.bat` - Installation script
- ✅ `start-server.bat` - Start server script
- ✅ `setup-firewall.bat` - Firewall configuration
- ✅ `update.bat` - Update script
- ✅ `VERSION.txt` - Version information

---

## 📋 Detailed Build Process

### Option 1: Automated Build (Recommended)

```bash
npm run package
```

This single command:
1. Runs `npm run build` (bundles code)
2. Runs `npm run build:exe` (creates executable)
3. Runs `package-deployment.js` (creates deployment folder)

### Option 2: Manual Build Steps

If you need more control:

```bash
# Step 1: Bundle the code
npm run build
# Creates: dist/server.cjs and dist/entry.js

# Step 2: Create executable
npm run build:exe
# Creates: dist/wms-api.exe

# Step 3: Package for deployment
node package-deployment.js
# Creates: deployment/ folder with all files
```

---

## 🔧 Build Requirements

### Prerequisites

1. **Node.js 18 or higher**
   ```bash
   node --version  # Should show v18.x.x or higher
   ```

2. **npm packages installed**
   ```bash
   npm install
   ```

3. **Build tools** (installed automatically):
   - `esbuild` - Code bundler
   - `pkg` - Executable creator

### Build Tools Installation

If build fails, install tools manually:

```bash
npm install --save-dev esbuild pkg
```

---

## 📁 Deployment Package Structure

```
deployment/
├── wms-api.exe              # Standalone executable (no Node.js needed)
├── .env.template            # Configuration template
├── .env                     # Actual config (created by install.bat)
├── README.txt               # User documentation
├── VERSION.txt              # Build version info
├── install.bat              # First-time setup script
├── start-server.bat         # Start server script
├── stop-server.bat          # Stop server script
├── setup-firewall.bat       # Configure Windows Firewall
├── update.bat               # Update script
├── install-service.bat      # Install as Windows Service
├── uninstall-service.bat    # Remove Windows Service
├── start-hidden.vbs          # Start in hidden window
└── log/                     # Log files directory (created at runtime)
    ├── Error_log/
    │   └── error_YYYY-MM-DD.log
    └── detailed_YYYY-MM-DD.log
```

---

## 🎯 Deployment Steps for Client

### Step 1: Copy Deployment Folder

Copy the entire `deployment/` folder to the target machine.

### Step 2: Run Installation

1. Open the `deployment/` folder
2. Double-click `install.bat`
3. This will:
   - Create `.env` file from template
   - Open `.env` in Notepad for editing

### Step 3: Configure Environment

Edit `.env` file with your settings:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_database_name

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Security
JWT_SECRET=your_secure_jwt_secret_key_change_this

# Logging
Error_log=1          # Enable error logging (recommended: 1)
Detailed_log=0       # Disable detailed logs in production (0) or enable for debugging (1)
```

### Step 4: Configure Firewall (Optional)

If server needs to be accessible from network:

1. Right-click `setup-firewall.bat`
2. Select "Run as Administrator"
3. This adds Windows Firewall rule for port 3000

### Step 5: Start Server

**Option A: Interactive Mode (Recommended for first run)**
- Double-click `start-server.bat`
- Server runs in console window
- Press Ctrl+C to stop

**Option B: Hidden Mode**
- Double-click `start-hidden.vbs`
- Server runs in background (no console window)

**Option C: Windows Service (Production)**
- Run `install-service.bat` as Administrator
- Server runs as Windows Service
- Starts automatically on boot

### Step 6: Verify Installation

Open browser: http://localhost:3000/health

Expected response:
```json
{
  "status": "ok",
  "message": "WMS API Server is running"
}
```

---

## 🔄 Updating Existing Deployment

### Method 1: Using Update Script

1. Stop the server (if running)
2. Replace `wms-api.exe` with new version
3. Run `update.bat`
4. Restart server

### Method 2: Manual Update

1. Stop the server
2. Backup `.env` file (important!)
3. Replace `wms-api.exe` with new version
4. Keep existing `.env` file (don't overwrite)
5. Restart server

**Important:** Always keep the `.env` file - it contains your configuration!

---

## 🌐 Network Configuration

### Access from Other Devices

The server binds to `0.0.0.0:3000` by default, making it accessible on your network.

**To access from mobile app or other devices:**

1. Find server IP address:
   ```bash
   # Windows
   ipconfig
   # Look for IPv4 Address (e.g., 192.168.1.100)
   ```

2. Configure firewall:
   - Run `setup-firewall.bat` as Administrator
   - Or manually allow port 3000 in Windows Firewall

3. Access from other devices:
   ```
   http://192.168.1.100:3000/health
   ```

### Desktop App Configuration

Update desktop app settings:
- API Endpoint URL: `http://192.168.1.100:3000/api`
- (Replace with your actual server IP)

---

## 🛠️ Running as Windows Service

For production environments, run as a Windows Service:

### Installation

1. Run `install-service.bat` as Administrator
2. Service name: `WMS-API`
3. Service starts automatically on boot

### Service Management

**Start Service:**
```bash
net start WMS-API
```

**Stop Service:**
```bash
net stop WMS-API
```

**Uninstall Service:**
- Run `uninstall-service.bat` as Administrator

### Service Logs

Service logs are saved to:
- `log/Error_log/error_YYYY-MM-DD.log`
- `log/detailed_YYYY-MM-DD.log`

---

## 📊 Logging Configuration

### Error Logging

**Enable:** `Error_log=1` in `.env`
- Saves all errors to `log/Error_log/error_YYYY-MM-DD.log`
- Errors always shown in console
- **Recommended:** Always enabled (1)

### Detailed Logging

**Enable:** `Detailed_log=1` in `.env`
- Saves info, debug, warnings to `log/detailed_YYYY-MM-DD.log`
- **Production:** Set to 0 (only errors logged)
- **Debugging:** Set to 1 (all logs saved)

### Log File Location

```
deployment/
└── log/
    ├── Error_log/
    │   └── error_2026-01-26.log
    └── detailed_2026-01-26.log
```

---

## 🔍 Troubleshooting

### Issue: Executable Won't Start

**Solutions:**
1. Check `.env` file exists in same folder as `wms-api.exe`
2. Verify `.env` syntax (no extra spaces, correct format)
3. Run from command line to see error messages:
   ```bash
   cd deployment
   wms-api.exe
   ```

### Issue: Port Already in Use

**Solutions:**
1. Change `PORT` in `.env` file (e.g., `PORT=3001`)
2. Or stop the process using port 3000:
   ```bash
   # Find process
   netstat -ano | findstr :3000
   # Kill process (replace <PID> with actual PID)
   taskkill /PID <PID> /F
   ```

### Issue: Database Connection Failed

**Solutions:**
1. Verify database is running
2. Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
3. Test connection from server machine:
   ```bash
   mysql -h localhost -u your_user -p
   ```
4. Ensure database user has proper permissions
5. Check firewall allows database port (usually 3306)

### Issue: Server Not Accessible from Network

**Solutions:**
1. Run `setup-firewall.bat` as Administrator
2. Verify `HOST=0.0.0.0` in `.env` (not `localhost`)
3. Check Windows Firewall settings
4. Verify server IP address is correct
5. Test from server machine first: http://localhost:3000/health

### Issue: Build Fails

**Solutions:**
1. Ensure Node.js 18+ is installed: `node --version`
2. Reinstall dependencies: `npm install`
3. Clear cache: `npm cache clean --force`
4. Check build tools: `npm list esbuild pkg`
5. Install missing tools: `npm install --save-dev esbuild pkg`

---

## 📝 Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `3306` |
| `DB_USER` | Database username | `root` |
| `DB_PASSWORD` | Database password | `your_password` |
| `DB_NAME` | Database name | `wms_desktop` |
| `JWT_SECRET` | JWT secret key | `your-secret-key` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `production` |
| `Error_log` | Enable error logging | `1` |
| `Detailed_log` | Enable detailed logging | `0` |
| `JWT_EXPIRES_IN` | JWT expiration | `7d` |

---

## ✅ Pre-Deployment Checklist

Before creating deployment package:

- [ ] All code changes committed
- [ ] Dependencies updated (`npm install`)
- [ ] `.env.template` updated with latest variables
- [ ] Version number updated in `VERSION.txt`
- [ ] README.txt documentation is current
- [ ] Test build locally: `npm run package`
- [ ] Verify executable runs: `cd deployment && wms-api.exe`
- [ ] Test health endpoint: http://localhost:3000/health
- [ ] Test database connection
- [ ] Verify all scripts work (install.bat, start-server.bat, etc.)

---

## 🎯 Deployment Scenarios

### Scenario 1: Fresh Installation

1. Run `npm run package`
2. Copy `deployment/` folder to target machine
3. Run `install.bat` on target machine
4. Configure `.env` file
5. Run `start-server.bat`
6. Verify: http://localhost:3000/health

### Scenario 2: Update Existing Installation

1. Run `npm run package` (build new version)
2. Stop server on target machine
3. Backup `.env` file
4. Replace `wms-api.exe` with new version
5. Keep existing `.env` file
6. Restart server

### Scenario 3: Production Deployment

1. Build: `npm run package`
2. Copy `deployment/` folder to production server
3. Run `install.bat` (creates `.env`)
4. Configure `.env` with production settings
5. Run `setup-firewall.bat` as Administrator
6. Run `install-service.bat` as Administrator
7. Service starts automatically
8. Verify: http://server-ip:3000/health

---

## 📦 Distribution

### Creating Distribution Package

After building, the `deployment/` folder is ready for distribution:

**Option 1: ZIP Archive**
```bash
# Create ZIP file
cd wms-api
powershell Compress-Archive -Path deployment -DestinationPath wms-api-deployment.zip
```

**Option 2: Copy Folder**
- Copy entire `deployment/` folder to USB drive or network share
- Client extracts/copies to target machine

### Distribution Contents

Include in distribution:
- ✅ Entire `deployment/` folder
- ✅ Installation instructions (README.txt)
- ✅ Version information (VERSION.txt)

**Do NOT include:**
- ❌ `.env` file (contains sensitive data)
- ❌ `log/` folder (runtime files)
- ❌ `node_modules/` (not needed for executable)

---

## 🔐 Security Best Practices

1. **Change JWT_SECRET** in production
   - Use a strong, random secret key
   - Never commit `.env` to version control

2. **Database Security**
   - Use dedicated database user (not root)
   - Grant only necessary permissions
   - Use strong database password

3. **Network Security**
   - Use firewall to restrict access
   - Consider using HTTPS in production (requires reverse proxy)
   - Limit database access to API server only

4. **Logging**
   - Set `Detailed_log=0` in production
   - Regularly review error logs
   - Rotate log files periodically

---

## 📞 Support

### Common Issues

- **Server won't start:** Check `.env` file exists and is valid
- **Database connection fails:** Verify credentials and database is running
- **Port in use:** Change PORT in `.env` or stop conflicting service
- **Network access denied:** Run `setup-firewall.bat` as Administrator

### Getting Help

1. Check error logs: `log/Error_log/error_YYYY-MM-DD.log`
2. Check detailed logs: `log/detailed_YYYY-MM-DD.log`
3. Run server from command line to see console output
4. Verify `.env` configuration
5. Test database connection separately

---

## 🎉 Success!

Once deployed, your API server will be accessible at:
- **Local:** http://localhost:3000
- **Network:** http://YOUR_IP:3000
- **Health Check:** http://localhost:3000/health
- **API Base:** http://localhost:3000/api

The server is now ready to handle requests from:
- Desktop application
- Mobile application
- Any HTTP client

---

## 📝 Version History

- **v1.0.0** - Initial deployment package
- Build includes all latest fixes and features
- Standalone executable (no Node.js required)
- Complete deployment automation
