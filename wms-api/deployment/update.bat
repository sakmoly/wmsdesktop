@echo off
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
