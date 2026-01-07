@echo off
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
