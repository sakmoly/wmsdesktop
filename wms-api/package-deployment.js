// Package deployment files into a distributable folder
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function packageDeployment() {
  console.log('📦 Creating deployment package...\n');

  const deployDir = join(__dirname, 'deployment');
  
  // Create deployment directory
  if (!existsSync(deployDir)) {
    mkdirSync(deployDir, { recursive: true });
  }

  // Check if executable exists
  const exePath = join(__dirname, 'dist', 'wms-api.exe');
  if (!existsSync(exePath)) {
    console.error('❌ Error: wms-api.exe not found. Run "npm run build:exe" first.');
    process.exit(1);
  }

  // Copy executable
  console.log('📋 Copying executable...');
  copyFileSync(exePath, join(deployDir, 'wms-api.exe'));

  // Create .env.template
  console.log('📋 Creating .env.template...');
  const envTemplate = `# WMS API Server Configuration
# Copy this file to .env and update with your database credentials

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_database_name

# API Configuration
API_BASE_URL=
JWT_SECRET=your_jwt_secret_key_change_this_in_production

# Logging Configuration
# Error_log: Set to 1 to enable error logging (saves to \\log\\Error_log\\ directory)
# Set to 0 to disable error log file (errors will still appear in console)
Error_log=1

# Detailed_log: Set to 1 to enable detailed logging (info, debug, warnings)
# Set to 0 to disable all detailed logs (only errors will be logged if Error_log=1)
Detailed_log=1
`;
  writeFileSync(join(deployDir, '.env.template'), envTemplate);

  // Create README
  console.log('📋 Creating README...');
  const readme = `# WMS API Server - Deployment Package

## Quick Start

1. **Configure Environment**
   - Copy \`.env.template\` to \`.env\`
   - Edit \`.env\` with your database credentials and settings

2. **Run the Server**
   - Double-click \`wms-api.exe\` to start the server
   - Or run from command line: \`wms-api.exe\`

3. **Verify Installation**
   - Open browser: http://localhost:3000/health
   - Should see: {"status":"ok","message":"WMS API Server is running"}

## Configuration

Edit \`.env\` file to configure:

- **Database**: Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
- **Server**: Set PORT (default: 3000) and HOST (default: 0.0.0.0)
- **Security**: Set JWT_SECRET (required for authentication)
- **Logging**:
  - **Error_log=1**: Enable error logging (saves to \\log\\Error_log\\ directory)
  - **Detailed_log=1**: Enable detailed logging (info, debug, warnings)
  - Set to 0 to disable each logging type

## Logging

The server supports two types of logging:

1. **Error Logging** (\`Error_log=1\`):
   - All errors are saved to \`\\log\\Error_log\\error_YYYY-MM-DD.log\`
   - Errors are always shown in console regardless of setting
   - Recommended: Always keep enabled (Error_log=1)

2. **Detailed Logging** (\`Detailed_log=1\`):
   - Logs all info, debug, and warning messages
   - Saves to \`\\log\\detailed_YYYY-MM-DD.log\`
   - Set to 0 to disable (only errors will be logged if Error_log=1)
   - Recommended: Enable for debugging, disable for production

Log files are created daily (one file per day) in the \`log\` directory.

## Network Access

By default, the server binds to \`0.0.0.0:3000\`, making it accessible on your network.

To access from other devices:
- Find your computer's IP address: \`ipconfig\` (Windows) or \`ifconfig\` (Linux/Mac)
- Access: http://YOUR_IP:3000/health

## Windows Firewall

If the server doesn't respond from other devices, you may need to:
1. Allow the application through Windows Firewall
2. Or run: \`netsh advfirewall firewall add rule name="WMS API" dir=in action=allow protocol=TCP localport=3000\`

## Troubleshooting

- **Port already in use**: Change PORT in .env file
- **Database connection failed**: Check DB_* settings in .env
- **Server won't start**: Check .env file exists and is properly configured

## API Endpoints

- Health Check: GET http://localhost:3000/health
- API Base: http://localhost:3000/api
- Login: POST http://localhost:3000/api/auth/login

## Support

For issues or questions, contact your system administrator.
`;
  writeFileSync(join(deployDir, 'README.txt'), readme);

  // Create start script
  console.log('📋 Creating start script...');
  const startScript = `@echo off
echo Starting WMS API Server...
echo.

if not exist .env (
    echo ERROR: .env file not found!
    echo Please copy .env.template to .env and configure it.
    echo.
    pause
    exit /b 1
)

echo Starting server on port 3000...
echo Press Ctrl+C to stop the server.
echo.
wms-api.exe
pause
`;
  writeFileSync(join(deployDir, 'start-server.bat'), startScript);

  // Create install script
  console.log('📋 Creating install script...');
  const installScript = `@echo off
echo ========================================
echo WMS API Server - Installation
echo ========================================
echo.

REM Check if .env exists
if exist .env (
    echo .env file already exists.
    echo Skipping .env creation.
) else (
    echo Creating .env file from template...
    copy .env.template .env
    echo.
    echo ========================================
    echo IMPORTANT: Please edit .env file
    echo with your database credentials!
    echo ========================================
    echo.
    echo Opening .env file for editing...
    notepad .env
)

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Edit .env file with your database settings
echo 2. Run start-server.bat to start the server
echo 3. Test: http://localhost:3000/health
echo.
pause
`;
  writeFileSync(join(deployDir, 'install.bat'), installScript);

  // Create firewall rule script
  console.log('📋 Creating firewall script...');
  const firewallScript = `@echo off
echo ========================================
echo WMS API Server - Firewall Setup
echo ========================================
echo.
echo Adding Windows Firewall rule for port 3000...
echo.

netsh advfirewall firewall delete rule name="WMS API Server" >nul 2>&1
netsh advfirewall firewall add rule name="WMS API Server" dir=in action=allow protocol=TCP localport=3000

if %ERRORLEVEL% EQU 0 (
    echo ✅ Firewall rule added successfully!
    echo.
    echo The server is now accessible from other devices on your network.
) else (
    echo ❌ Failed to add firewall rule.
    echo Please run this script as Administrator.
    echo.
)

echo.
pause
`;
  writeFileSync(join(deployDir, 'setup-firewall.bat'), firewallScript);

  // Copy service installation scripts (if they exist)
  console.log('📋 Copying service installation scripts...');
  try {
    if (existsSync(join(__dirname, 'install-service.bat'))) {
      copyFileSync(join(__dirname, 'install-service.bat'), join(deployDir, 'install-service.bat'));
    }
    if (existsSync(join(__dirname, 'uninstall-service.bat'))) {
      copyFileSync(join(__dirname, 'uninstall-service.bat'), join(deployDir, 'uninstall-service.bat'));
    }
    if (existsSync(join(__dirname, 'start-hidden.vbs'))) {
      copyFileSync(join(__dirname, 'start-hidden.vbs'), join(deployDir, 'start-hidden.vbs'));
    }
    if (existsSync(join(__dirname, 'stop-server.bat'))) {
      copyFileSync(join(__dirname, 'stop-server.bat'), join(deployDir, 'stop-server.bat'));
    }
  } catch (error) {
    console.warn('Warning: Could not copy service scripts:', error.message);
  }

  // Create update script for client
  console.log('📋 Creating update script...');
  const updateScript = `@echo off
echo ========================================
echo WMS API Server - Update Script
echo ========================================
echo.

REM Backup .env file
if exist .env (
    echo Backing up .env file...
    copy .env .env.backup >nul 2>&1
    echo ✅ .env file backed up to .env.backup
    echo.
)

REM Check if server is running
tasklist /FI "IMAGENAME eq wms-api.exe" 2>NUL | find /I /N "wms-api.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo ⚠️  Server is currently running!
    echo Please stop the server before updating.
    echo.
    pause
    exit /b 1
)

REM Check if new executable exists (if updating incrementally)
if exist wms-api.exe.new (
    echo Installing new version...
    if exist wms-api.exe (
        del wms-api.exe
    )
    ren wms-api.exe.new wms-api.exe
    echo ✅ New version installed successfully!
) else (
    echo ℹ️  No new version file found (wms-api.exe.new)
    echo.
    echo To update:
    echo 1. Stop the server
    echo 2. Replace wms-api.exe with the new version
    echo 3. Run start-server.bat
)

echo.
echo ========================================
echo Update Complete!
echo ========================================
echo.
pause
`;
  writeFileSync(join(deployDir, 'update.bat'), updateScript);

  // Create version file (customer can compare VERSION.txt across sites)
  console.log('📋 Creating version file...');
  let pkgVersion = '1.0.0';
  try {
    const pkgPath = join(__dirname, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.version) pkgVersion = String(pkg.version);
  } catch {
    /* keep default */
  }
  const builtAt = new Date().toISOString();
  const versionInfo = `WMS API Server — deployment bundle
package.json version: ${pkgVersion}
build_timestamp_utc: ${builtAt}
build_local: ${new Date().toString()}
`;
  writeFileSync(join(deployDir, 'VERSION.txt'), versionInfo);

  console.log('\n✅ Deployment package created successfully!');
  console.log(`📁 Location: ${deployDir}\n`);
  console.log('Package contents:');
  console.log('  - wms-api.exe (Main executable)');
  console.log('  - .env.template (Configuration template)');
  console.log('  - README.txt (Documentation)');
  console.log('  - install.bat (Installation script)');
  console.log('  - start-server.bat (Start server script)');
  console.log('  - setup-firewall.bat (Firewall setup)');
  console.log('  - update.bat (Update script)');
  console.log('  - VERSION.txt (Version information)');
  console.log('  - install-service.bat (Install as Windows Service)');
  console.log('  - uninstall-service.bat (Remove Windows Service)');
  console.log('  - start-hidden.vbs (Start in hidden window)');
  console.log('  - stop-server.bat (Stop server process)');
  console.log('\n📦 Ready for deployment!');
  console.log('\n💡 To update client:');
  console.log('   1. Run: npm run package');
  console.log('   2. Send deployment/ folder to client');
  console.log('   3. Client replaces wms-api.exe and restarts');
}

packageDeployment();
