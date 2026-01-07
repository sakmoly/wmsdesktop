# How to Update Client Deployment Package

## Steps to Send Updated Version to Client

### 1. Build New Deployment Package

After making code changes, rebuild the deployment package:

```bash
cd "d:\Development Project\Printechs WMS\Wms.Desktop\wms-api"
npm run package
```

This will:
- Rebuild the bundled code
- Create a new `wms-api.exe` with your changes
- Update the `deployment` folder with the new executable

### 2. What to Send to Client

Send the entire **`deployment`** folder to the client. It contains:

- `wms-api.exe` (updated executable)
- `.env.template` (configuration template)
- `README.txt` (documentation)
- `install.bat` (installation script)
- `start-server.bat` (start server script)
- `setup-firewall.bat` (firewall setup)

**IMPORTANT:** The client's existing `.env` file is preserved during update.

### 3. Client Update Process

The client should:

1. **Stop the server** (if running)
   - Close the command window or stop the `wms-api.exe` process

2. **Backup existing `.env` file** (recommended)
   ```bash
   copy .env .env.backup
   ```

3. **Replace files** with new deployment package:
   - Copy new `wms-api.exe` (overwrite old one)
   - Keep existing `.env` file (don't overwrite)
   - Update other files if needed (bat scripts, README, etc.)

4. **Start the server**:
   - Run `start-server.bat` or double-click `wms-api.exe`

### 4. Quick Update Script for Client

You can create an `update.bat` script for easier client updates:

```batch
@echo off
echo ========================================
echo WMS API Server - Update Script
echo ========================================
echo.

REM Backup .env file
if exist .env (
    echo Backing up .env file...
    copy .env .env.backup
    echo .env file backed up to .env.backup
    echo.
)

REM Check if new wms-api.exe exists
if exist wms-api.exe.new (
    echo Installing new version...
    if exist wms-api.exe (
        del wms-api.exe
    )
    ren wms-api.exe.new wms-api.exe
    echo New version installed successfully!
) else (
    echo No new version found (wms-api.exe.new)
    echo Please place the new executable as wms-api.exe.new
)

echo.
echo Update complete!
echo.
pause
```

## Alternative: Incremental Update

If you only want to send the updated executable:

1. **Build the executable:**
   ```bash
   npm run build:exe
   ```

2. **Send only `dist/wms-api.exe`** to client

3. **Client replaces** the old `wms-api.exe` with the new one

4. **Client restarts** the server

## Full Clean Build (if needed)

If you encounter issues, do a full clean rebuild:

```bash
# Remove old build artifacts
rm -rf dist deployment

# Reinstall dependencies (if needed)
npm install

# Build fresh deployment package
npm run package
```

## Version Tracking (Optional)

To help track versions, you can:

1. **Add version to server startup:**
   ```javascript
   logger.info(`WMS API Server v1.0.0`);
   ```

2. **Create a version file:**
   - `deployment/VERSION.txt` with version number
   - Client can check this to verify version

3. **Include build date:**
   - The executable includes build timestamp in its metadata

## Client Requirements

**Client does NOT need to:**
- ❌ Run `npm install` (they use the executable)
- ❌ Have Node.js installed (executable includes it)
- ❌ Reconfigure `.env` (existing config is preserved)

**Client only needs to:**
- ✅ Stop the server
- ✅ Replace `wms-api.exe` with new version
- ✅ Start the server again

## Troubleshooting

### Build Fails

```bash
# Clean and rebuild
rm -rf dist deployment node_modules
npm install
npm run package
```

### Client Can't Start New Version

1. Check if old process is still running:
   ```bash
   tasklist | findstr wms-api
   ```

2. Kill old process:
   ```bash
   taskkill /F /IM wms-api.exe
   ```

3. Try starting again

### Configuration Lost

If client accidentally deleted `.env`:
1. Copy `.env.template` to `.env`
2. Restore from `.env.backup` if available
3. Or reconfigure manually

## Summary

**Developer Side:**
```bash
npm run package    # Build new deployment package
# Send deployment/ folder to client
```

**Client Side:**
```bash
# Stop server
# Replace wms-api.exe
# Start server
# No npm install needed! ✅
```

