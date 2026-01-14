@echo off
REM ============================================================
REM Auto Fix Material Request Stock Sync - Batch Script
REM ============================================================

echo ============================================================
echo Auto Fix Material Request Stock Sync
echo ============================================================
echo.

REM Check if MySQL is available
where mysql >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: MySQL command-line client not found!
    echo Please install MySQL client or add it to your PATH
    echo.
    echo Alternatively, you can run the SQL scripts manually:
    echo   1. Run SCRIPTS\CheckStockSyncForMaterialRequest.sql
    echo   2. Run SCRIPTS\FixMaterialRequestStockSync.sql
    pause
    exit /b 1
)

REM Prompt for database credentials
set /p DB_NAME="Enter database name: "
set /p DB_USER="Enter MySQL username: "
set /p DB_PASS="Enter MySQL password: "
set /p DB_HOST="Enter MySQL host (default: localhost): "
if "%DB_HOST%"=="" set DB_HOST=localhost
set /p DB_PORT="Enter MySQL port (default: 3306): "
if "%DB_PORT%"=="" set DB_PORT=3306

echo.
echo Step 1: Running diagnostic script...
echo.

REM Run diagnostic script
if not exist "SCRIPTS\CheckStockSyncForMaterialRequest.sql" (
    echo ERROR: Diagnostic script not found: SCRIPTS\CheckStockSyncForMaterialRequest.sql
    pause
    exit /b 1
)

mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% < SCRIPTS\CheckStockSyncForMaterialRequest.sql
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Diagnostic script returned error code %ERRORLEVEL%
)

echo.
echo Step 2: Running fix script...
echo.

REM Run fix script
if not exist "SCRIPTS\FixMaterialRequestStockSync.sql" (
    echo ERROR: Fix script not found: SCRIPTS\FixMaterialRequestStockSync.sql
    pause
    exit /b 1
)

mysql -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% < SCRIPTS\FixMaterialRequestStockSync.sql
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Fix script completed successfully!
) else (
    echo.
    echo WARNING: Fix script returned error code %ERRORLEVEL%
)

echo.
echo ============================================================
echo Auto Fix Completed!
echo ============================================================
echo.
echo Next Steps:
echo   1. Restart the API server to apply code changes
echo   2. Refresh the Items list in the desktop app
echo   3. Open Item Location Breakdown
echo   4. Both should now show the same quantity
echo.
pause
