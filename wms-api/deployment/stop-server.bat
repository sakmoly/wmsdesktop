@echo off
REM Stop WMS API Server (if running as process)

echo Stopping WMS API Server...

REM Try to stop by process name
taskkill /F /IM wms-api.exe >nul 2>&1

if %errorlevel% equ 0 (
    echo ✅ Server stopped successfully.
) else (
    echo ℹ️  No running server process found.
)

echo.
pause
