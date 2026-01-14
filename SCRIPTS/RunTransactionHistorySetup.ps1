# ============================================================
# Auto Run Transaction History Setup (PowerShell)
# This script automatically executes the SQL setup
# ============================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Auto Setup Transaction History Table" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Set database credentials
$DB_HOST = "localhost"
$DB_PORT = 3306
$DB_USER = "erppadmin"
$DB_PASS = "P61nt!"
$DB_NAME = "wms_desktop"

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ScriptDir "AutoSetupTransactionHistory.sql"

Write-Host "Database Configuration:" -ForegroundColor Cyan
Write-Host "  Host: $DB_HOST" -ForegroundColor Gray
Write-Host "  Port: $DB_PORT" -ForegroundColor Gray
Write-Host "  Database: $DB_NAME" -ForegroundColor Gray
Write-Host "  User: $DB_USER" -ForegroundColor Gray
Write-Host ""

# Check if MySQL is available
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysqlPath) {
    Write-Host "ERROR: MySQL command-line client not found in PATH!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please either:" -ForegroundColor Yellow
    Write-Host "  1. Add MySQL bin directory to PATH, OR" -ForegroundColor White
    Write-Host "  2. Run the script manually in MySQL Workbench:" -ForegroundColor White
    Write-Host "     - Open: $ScriptPath" -ForegroundColor Gray
    Write-Host "     - Execute the script" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if script exists
if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: Script not found: $ScriptPath" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Executing SQL script..." -ForegroundColor Green
Write-Host ""

# Execute MySQL command
try {
    $mysqlCommand = "mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME"
    Get-Content $ScriptPath -Encoding UTF8 | & $mysqlCommand 2>&1 | ForEach-Object {
        Write-Host $_ -ForegroundColor White
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "SUCCESS: Setup completed successfully!" -ForegroundColor Green
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "The transaction history table is now active and will" -ForegroundColor White
        Write-Host "automatically capture all future transactions." -ForegroundColor White
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Yellow
        Write-Host "  1. Test by performing a transaction (Material Request, etc.)" -ForegroundColor White
        Write-Host "  2. Check tabTransactionHistory to verify it was captured" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Red
        Write-Host "ERROR: Setup failed!" -ForegroundColor Red
        Write-Host "============================================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please check:" -ForegroundColor Yellow
        Write-Host "  1. MySQL server is running" -ForegroundColor White
        Write-Host "  2. Database credentials are correct" -ForegroundColor White
        Write-Host "  3. Database exists: $DB_NAME" -ForegroundColor White
        Write-Host "  4. User has proper permissions" -ForegroundColor White
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to execute script" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run the script manually in MySQL Workbench:" -ForegroundColor Yellow
    Write-Host "  - Open: $ScriptPath" -ForegroundColor White
    Write-Host "  - Execute the script" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Read-Host "Press Enter to exit"
