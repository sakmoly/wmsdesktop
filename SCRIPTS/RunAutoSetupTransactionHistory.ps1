# ============================================================
# Auto Setup Transaction History - PowerShell Script
# This script automatically executes the SQL setup script
# ============================================================

param(
    [string]$DatabaseName = "",
    [string]$DatabaseUser = "",
    [string]$DatabasePassword = "",
    [string]$DatabaseHost = "localhost",
    [int]$DatabasePort = 3306
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Auto Setup Transaction History Table" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if MySQL is available
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysqlPath) {
    Write-Host "ERROR: MySQL command-line client not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install MySQL client or run the script manually:" -ForegroundColor Yellow
    Write-Host "  1. Open MySQL Workbench" -ForegroundColor White
    Write-Host "  2. Open: SCRIPTS/AutoSetupTransactionHistory.sql" -ForegroundColor White
    Write-Host "  3. Execute the script" -ForegroundColor White
    exit 1
}

# Try to get database credentials from common locations
$envFile = "wms-api\.env"
if (Test-Path $envFile) {
    Write-Host "Found .env file, reading database configuration..." -ForegroundColor Green
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "DB_NAME=(.+)") { $DatabaseName = $matches[1].Trim() }
    if ($envContent -match "DB_USER=(.+)") { $DatabaseUser = $matches[1].Trim() }
    if ($envContent -match "DB_PASS=(.+)") { $DatabasePassword = $matches[1].Trim() }
    if ($envContent -match "DB_HOST=(.+)") { $DatabaseHost = $matches[1].Trim() }
    if ($envContent -match "DB_PORT=(.+)") { $DatabasePort = [int]$matches[1].Trim() }
}

# Check for config.json
$configFile = "wms-api\config.json"
if (Test-Path $configFile) {
    Write-Host "Found config.json, reading database configuration..." -ForegroundColor Green
    try {
        $config = Get-Content $configFile | ConvertFrom-Json
        if ($config.database) {
            if ([string]::IsNullOrEmpty($DatabaseName)) { $DatabaseName = $config.database.name }
            if ([string]::IsNullOrEmpty($DatabaseUser)) { $DatabaseUser = $config.database.user }
            if ([string]::IsNullOrEmpty($DatabasePassword)) { $DatabasePassword = $config.database.password }
            if ([string]::IsNullOrEmpty($DatabaseHost)) { $DatabaseHost = $config.database.host }
            if ($DatabasePort -eq 3306) { $DatabasePort = $config.database.port }
        }
    } catch {
        Write-Host "Could not read config.json: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Prompt for missing credentials
if ([string]::IsNullOrEmpty($DatabaseName)) {
    $DatabaseName = Read-Host "Enter database name"
}

if ([string]::IsNullOrEmpty($DatabaseUser)) {
    $DatabaseUser = Read-Host "Enter MySQL username"
}

if ([string]::IsNullOrEmpty($DatabasePassword)) {
    $SecurePassword = Read-Host "Enter MySQL password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    $DatabasePassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

Write-Host ""
Write-Host "Database Configuration:" -ForegroundColor Cyan
Write-Host "  Host: $DatabaseHost" -ForegroundColor Gray
Write-Host "  Port: $DatabasePort" -ForegroundColor Gray
Write-Host "  Database: $DatabaseName" -ForegroundColor Gray
Write-Host "  User: $DatabaseUser" -ForegroundColor Gray
Write-Host ""

# Check if script exists
$scriptPath = "SCRIPTS\AutoSetupTransactionHistory.sql"
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "Executing SQL script..." -ForegroundColor Green
Write-Host ""

# Execute MySQL command
$mysqlCommand = "mysql -h $DatabaseHost -P $DatabasePort -u $DatabaseUser -p$DatabasePassword $DatabaseName"
try {
    Get-Content $scriptPath -Encoding UTF8 | & $mysqlCommand 2>&1 | ForEach-Object {
        Write-Host $_ -ForegroundColor White
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "✅ Setup completed successfully!" -ForegroundColor Green
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Yellow
        Write-Host "  1. The transaction history table is now active" -ForegroundColor White
        Write-Host "  2. All future transactions will be automatically logged" -ForegroundColor White
        Write-Host "  3. Test by performing a transaction (Material Request, etc.)" -ForegroundColor White
        Write-Host "  4. Verify it appears in tabTransactionHistory" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "WARNING: Script returned exit code $LASTEXITCODE" -ForegroundColor Yellow
        Write-Host "Please review the output above for any errors" -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to execute script" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run the script manually:" -ForegroundColor Yellow
    Write-Host "  mysql -u $DatabaseUser -p $DatabaseName < $scriptPath" -ForegroundColor White
    exit 1
}

Write-Host ""
