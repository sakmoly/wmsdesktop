@echo off
REM Uninstall WMS API Windows Service

echo ========================================
echo WMS API Server - Service Removal
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

REM Check if service exists
sc query "WMS-API-Server" >nul 2>&1
if %errorlevel% neq 0 (
    echo Service "WMS-API-Server" does not exist.
    echo.
    pause
    exit /b 0
)

echo Service "WMS-API-Server" found.
echo.

choice /C YN /M "Are you sure you want to remove the service"
if errorlevel 2 exit /b 0
if errorlevel 1 (
    echo.
    echo Stopping service...
    net stop "WMS-API-Server" >nul 2>&1
    
    echo Removing service...
    if exist "nssm.exe" (
        nssm remove "WMS-API-Server" confirm
    ) else (
        sc delete "WMS-API-Server"
    )
    
    if %errorlevel% equ 0 (
        echo.
        echo ✅ Service removed successfully!
    ) else (
        echo.
        echo ❌ Failed to remove service.
    )
)

echo.
pause
