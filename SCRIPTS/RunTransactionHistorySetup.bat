@echo off
REM ============================================================
REM Auto Run Transaction History Setup
REM This script automatically executes the SQL setup
REM ============================================================

echo ============================================================
echo Auto Setup Transaction History Table
echo ============================================================
echo.

REM Set database credentials
set DB_HOST=localhost
set DB_PORT=3306
set DB_USER=erppadmin
set DB_PASS=P61nt!
set DB_NAME=wms_desktop

REM Set script path
set SCRIPT_PATH=%~dp0AutoSetupTransactionHistory.sql

echo Database Configuration:
echo   Host: %DB_HOST%
echo   Port: %DB_PORT%
echo   Database: %DB_NAME%
echo   User: %DB_USER%
echo.

REM Check if MySQL is available
where mysql >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: MySQL command-line client not found in PATH!
    echo.
    echo Please either:
    echo   1. Add MySQL bin directory to PATH, OR
    echo   2. Run the script manually in MySQL Workbench:
    echo      - Open: %SCRIPT_PATH%
    echo      - Execute the script
    echo.
    pause
    exit /b 1
)

echo Executing SQL script...
echo.

REM Execute MySQL command
mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% < "%SCRIPT_PATH%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo SUCCESS: Setup completed successfully!
    echo ============================================================
    echo.
    echo The transaction history table is now active and will
    echo automatically capture all future transactions.
    echo.
) else (
    echo.
    echo ============================================================
    echo ERROR: Setup failed!
    echo ============================================================
    echo.
    echo Please check:
    echo   1. MySQL server is running
    echo   2. Database credentials are correct
    echo   3. Database exists: %DB_NAME%
    echo   4. User has proper permissions
    echo.
)

pause
