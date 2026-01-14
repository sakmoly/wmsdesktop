# ============================================================
# Execute Auto Fix Material Request Stock Sync
# This script automatically executes the SQL fix script
# ============================================================

param(
    [string]$ItemCode = "SKU-HAT-301-BLU-OS"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Executing Auto Fix Material Request Stock Sync" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if MySQL is available
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysqlPath) {
    Write-Host "ERROR: MySQL command-line client not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install MySQL client or run the script manually:" -ForegroundColor Yellow
    Write-Host "  1. Open MySQL Workbench" -ForegroundColor White
    Write-Host "  2. Open SCRIPTS/AutoRunMaterialRequestStockFix.sql" -ForegroundColor White
    Write-Host "  3. Edit @item_code if needed (line 7)" -ForegroundColor White
    Write-Host "  4. Execute the script" -ForegroundColor White
    exit 1
}

# Try to get database credentials from common locations
$dbConfig = $null
$dbName = ""
$dbUser = ""
$dbPass = ""
$dbHost = "localhost"
$dbPort = 3306

# Check for .env file in wms-api
$envFile = "wms-api\.env"
if (Test-Path $envFile) {
    Write-Host "Found .env file, reading database configuration..." -ForegroundColor Green
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "DB_NAME=(.+)") { $dbName = $matches[1].Trim() }
    if ($envContent -match "DB_USER=(.+)") { $dbUser = $matches[1].Trim() }
    if ($envContent -match "DB_PASS=(.+)") { $dbPass = $matches[1].Trim() }
    if ($envContent -match "DB_HOST=(.+)") { $dbHost = $matches[1].Trim() }
    if ($envContent -match "DB_PORT=(.+)") { $dbPort = [int]$matches[1].Trim() }
}

# Check for config.json in wms-api
$configFile = "wms-api\config.json"
if (Test-Path $configFile) {
    Write-Host "Found config.json, reading database configuration..." -ForegroundColor Green
    try {
        $config = Get-Content $configFile | ConvertFrom-Json
        if ($config.database) {
            if (-not $dbName) { $dbName = $config.database.name }
            if (-not $dbUser) { $dbUser = $config.database.user }
            if (-not $dbPass) { $dbName = $config.database.password }
            if (-not $dbHost) { $dbHost = $config.database.host }
            if (-not $dbPort) { $dbPort = $config.database.port }
        }
    } catch {
        Write-Host "Could not read config.json: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Prompt for missing credentials
if ([string]::IsNullOrEmpty($dbName)) {
    $dbName = Read-Host "Enter database name"
}

if ([string]::IsNullOrEmpty($dbUser)) {
    $dbUser = Read-Host "Enter MySQL username"
}

if ([string]::IsNullOrEmpty($dbPass)) {
    $SecurePassword = Read-Host "Enter MySQL password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    $dbPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

Write-Host ""
Write-Host "Database Configuration:" -ForegroundColor Cyan
Write-Host "  Host: $dbHost" -ForegroundColor Gray
Write-Host "  Port: $dbPort" -ForegroundColor Gray
Write-Host "  Database: $dbName" -ForegroundColor Gray
Write-Host "  User: $dbUser" -ForegroundColor Gray
Write-Host ""

# Check if script exists
$scriptPath = "SCRIPTS\AutoRunMaterialRequestStockFix.sql"
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

# Replace @item_code variable in script
Write-Host "Preparing script for item: $ItemCode" -ForegroundColor Green
$scriptContent = Get-Content $scriptPath -Raw -Encoding UTF8
$scriptContent = $scriptContent -replace "SET @item_code = 'SKU-HAT-301-BLU-OS';", "SET @item_code = '$ItemCode';"
$tempScript = [System.IO.Path]::GetTempFileName() + ".sql"
$scriptContent | Out-File -FilePath $tempScript -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "Executing SQL script..." -ForegroundColor Green
Write-Host ""

# Execute MySQL command
$mysqlCommand = "mysql -h $dbHost -P $dbPort -u $dbUser -p$dbPass $dbName"
try {
    Get-Content $tempScript | & $mysqlCommand 2>&1 | ForEach-Object {
        Write-Host $_ -ForegroundColor White
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "✅ Script executed successfully!" -ForegroundColor Green
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Yellow
        Write-Host "  1. Restart the API server (if running)" -ForegroundColor White
        Write-Host "  2. Rebuild the desktop app" -ForegroundColor White
        Write-Host "  3. Refresh Items list and Item Location Breakdown" -ForegroundColor White
        Write-Host "  4. Both should now show the same quantity" -ForegroundColor White
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
    Write-Host "  mysql -u $dbUser -p $dbName < $scriptPath" -ForegroundColor White
    exit 1
} finally {
    # Clean up temp file
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
