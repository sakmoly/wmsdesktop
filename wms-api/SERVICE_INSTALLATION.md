# Running WMS API as Windows Service

## Overview

Running the API as a Windows Service provides:
- ✅ Runs in background (no visible window)
- ✅ Starts automatically on system boot
- ✅ Can't be accidentally closed by users
- ✅ Automatic restart on failure
- ✅ Better for production environments

## Method 1: Windows Service (Recommended)

### Prerequisites

1. **Download NSSM (Non-Sucking Service Manager)**
   - Download from: https://nssm.cc/download
   - Extract `nssm.exe` (64-bit version) to your `deployment` folder
   - Or use winget: `winget install NSSM`

2. **Run as Administrator**
   - All service installation scripts require Administrator privileges

### Installation Steps

1. **Copy NSSM to deployment folder:**
   ```
   deployment/
   ├── wms-api.exe
   ├── nssm.exe          ← Place NSSM here
   ├── install-service.bat
   └── ...
   ```

2. **Install the service:**
   - Right-click `install-service.bat`
   - Select "Run as administrator"
   - Follow the prompts

3. **Start the service:**
   ```bash
   net start "WMS-API-Server"
   ```

### Service Management

**Start Service:**
```bash
net start "WMS-API-Server"
# Or: nssm start "WMS-API-Server"
```

**Stop Service:**
```bash
net stop "WMS-API-Server"
# Or: nssm stop "WMS-API-Server"
```

**Restart Service:**
```bash
net stop "WMS-API-Server"
net start "WMS-API-Server"
```

**Check Service Status:**
```bash
sc query "WMS-API-Server"
```

**Uninstall Service:**
- Right-click `uninstall-service.bat`
- Select "Run as administrator"

Or manually:
```bash
nssm remove "WMS-API-Server" confirm
```

### Service Configuration

The service is configured with:
- **Startup Type**: Automatic (starts on boot)
- **Auto Restart**: Enabled (restarts on failure)
- **Log Files**: `logs\service-stdout.log` and `logs\service-stderr.log`
- **Log Rotation**: Daily rotation, max 10MB per file

### Service Logs

Service output is logged to:
- **Standard Output**: `logs\service-stdout.log`
- **Standard Error**: `logs\service-stderr.log`

Logs rotate daily and are limited to 10MB per file.

## Method 2: Hidden Window (Simple)

If you don't want to install as a service, you can run in a hidden window:

### Start Hidden

1. **Double-click `start-hidden.vbs`**
   - Server starts in background (no visible window)
   - Can be closed by ending the process

2. **Stop the server:**
   - Run `stop-server.bat`
   - Or: `taskkill /F /IM wms-api.exe`

### Limitations

- ❌ Doesn't start on boot
- ❌ Can be killed via Task Manager
- ❌ No automatic restart on failure
- ✅ Simple setup (no installation needed)

## Method 3: Scheduled Task (Alternative)

You can also use Windows Task Scheduler:

1. Open Task Scheduler
2. Create Basic Task
3. Trigger: "When the computer starts"
4. Action: "Start a program"
5. Program: Path to `wms-api.exe`
6. Options: "Run whether user is logged on or not"
7. "Hidden" checkbox

## Comparison

| Feature | Windows Service | Hidden Window | Scheduled Task |
|---------|----------------|---------------|----------------|
| No visible window | ✅ | ✅ | ✅ |
| Auto-start on boot | ✅ | ❌ | ✅ |
| Auto-restart on failure | ✅ | ❌ | ❌ |
| Can't be closed by users | ✅ | ❌ | ⚠️ |
| Easy setup | ⚠️ | ✅ | ⚠️ |
| Production ready | ✅ | ❌ | ⚠️ |

## Recommended Setup

**For Production:**
- Use **Windows Service** (Method 1)
- Most reliable and secure
- Automatic startup and recovery

**For Development/Testing:**
- Use **Hidden Window** (Method 2)
- Quick and simple
- Easy to stop/restart

## Troubleshooting

### Service Won't Start

1. **Check logs:**
   ```
   logs\service-stderr.log
   ```

2. **Verify .env file exists:**
   - Service needs `.env` in same directory as `wms-api.exe`

3. **Check permissions:**
   - Ensure service account has read access to all files
   - Check database connection permissions

4. **Test manually:**
   ```bash
   # Run manually to see errors
   wms-api.exe
   ```

### Service Keeps Restarting

1. **Check error logs:**
   ```
   logs\service-stderr.log
   ```

2. **Common causes:**
   - Missing `.env` file
   - Database connection failed
   - Port already in use
   - Invalid configuration

3. **Disable auto-restart temporarily:**
   ```bash
   nssm set "WMS-API-Server" AppExit Default Exit
   ```

### Service Logs Not Appearing

1. **Check log directory exists:**
   ```bash
   dir logs
   ```

2. **Verify service is running:**
   ```bash
   sc query "WMS-API-Server"
   ```

3. **Check file permissions:**
   - Service account needs write access to `logs` directory

## Updating Service

When updating the API:

1. **Stop the service:**
   ```bash
   net stop "WMS-API-Server"
   ```

2. **Replace `wms-api.exe`** with new version

3. **Start the service:**
   ```bash
   net start "WMS-API-Server"
   ```

**Note:** Service configuration is preserved. No need to reinstall.

## Security Considerations

1. **Service Account:**
   - Default: Runs as `LocalSystem` (high privileges)
   - For production, consider using a dedicated service account

2. **Firewall:**
   - Service inherits firewall rules
   - May need to run `setup-firewall.bat` as Administrator

3. **File Permissions:**
   - Ensure service account can read `.env` and write logs
   - Restrict access to `.env` file (contains sensitive data)

## Files Included

- `install-service.bat` - Install as Windows Service
- `uninstall-service.bat` - Remove service
- `start-hidden.vbs` - Start in hidden window
- `stop-server.bat` - Stop running server
- `SERVICE_INSTALLATION.md` - This documentation

## Support

For service-related issues:
1. Check service logs: `logs\service-stderr.log`
2. Check Windows Event Viewer: `Windows Logs > Application`
3. Test API manually: `wms-api.exe`
4. Verify `.env` configuration
