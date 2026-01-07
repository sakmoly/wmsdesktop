@echo off
REM Install WMS API as Windows Service using NSSM

echo ========================================
echo WMS API Server - Service Installation
echo ========================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo Right-click and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

REM Check if NSSM exists
if not exist "nssm.exe" (
    echo Downloading NSSM (Non-Sucking Service Manager)...
    echo.
    echo Please download NSSM from: https://nssm.cc/download
    echo Or use: winget install NSSM
    echo.
    echo After downloading, extract nssm.exe to this folder.
    echo.
    pause
    exit /b 1
)

REM Check if service already exists
sc query "WMS-API-Server" >nul 2>&1
if %errorlevel% equ 0 (
    echo Service "WMS-API-Server" already exists!
    echo.
    choice /C YN /M "Do you want to remove the existing service"
    if errorlevel 2 exit /b 0
    if errorlevel 1 (
        echo Removing existing service...
        nssm stop "WMS-API-Server"
        nssm remove "WMS-API-Server" confirm
        echo Service removed.
        echo.
    )
)

REM Get current directory (where wms-api.exe is located)
set "SERVICE_DIR=%~dp0"
set "EXE_PATH=%SERVICE_DIR%wms-api.exe"

REM Check if executable exists
if not exist "%EXE_PATH%" (
    echo ERROR: wms-api.exe not found in: %SERVICE_DIR%
    echo.
    pause
    exit /b 1
)

echo Installing service...
echo Executable: %EXE_PATH%
echo Directory: %SERVICE_DIR%
echo.

REM Install service
nssm install "WMS-API-Server" "%EXE_PATH%"

REM Set working directory
nssm set "WMS-API-Server" AppDirectory "%SERVICE_DIR%"

REM Set service description
nssm set "WMS-API-Server" Description "WMS API Server - Warehouse Management System Backend API"

REM Set service display name
nssm set "WMS-API-Server" DisplayName "WMS API Server"

REM Set startup type to Automatic
nssm set "WMS-API-Server" Start SERVICE_AUTO_START

REM Set service to restart on failure
nssm set "WMS-API-Server" AppExit Default Restart
nssm set "WMS-API-Server" AppRestartDelay 5000
nssm set "WMS-API-Server" AppThrottle 1500

REM Set output log files
if not exist "%SERVICE_DIR%logs" mkdir "%SERVICE_DIR%logs"
nssm set "WMS-API-Server" AppStdout "%SERVICE_DIR%logs\service-stdout.log"
nssm set "WMS-API-Server" AppStderr "%SERVICE_DIR%logs\service-stderr.log"
nssm set "WMS-API-Server" AppRotateFiles 1
nssm set "WMS-API-Server" AppRotateOnline 1
nssm set "WMS-API-Server" AppRotateSeconds 86400
nssm set "WMS-API-Server" AppRotateBytes 10485760

echo.
echo ========================================
echo Service installed successfully!
echo ========================================
echo.
echo Service Name: WMS-API-Server
echo Display Name: WMS API Server
echo.
echo To start the service:
echo   net start "WMS-API-Server"
echo   Or: nssm start "WMS-API-Server"
echo.
echo To stop the service:
echo   net stop "WMS-API-Server"
echo   Or: nssm stop "WMS-API-Server"
echo.
echo To remove the service:
echo   nssm remove "WMS-API-Server" confirm
echo.
echo Log files:
echo   - Service output: %SERVICE_DIR%logs\service-stdout.log
echo   - Service errors: %SERVICE_DIR%logs\service-stderr.log
echo.

choice /C YN /M "Do you want to start the service now"
if errorlevel 2 goto end
if errorlevel 1 (
    echo.
    echo Starting service...
    net start "WMS-API-Server"
    if %errorlevel% equ 0 (
        echo.
        echo ✅ Service started successfully!
        echo.
        echo The API server is now running in the background.
        echo Check http://localhost:3000/health to verify.
    ) else (
        echo.
        echo ❌ Failed to start service. Check logs for errors.
    )
)

:end
echo.
pause
