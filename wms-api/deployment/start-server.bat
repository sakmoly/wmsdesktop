@echo off
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
