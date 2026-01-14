# PowerShell script to run MIGRATION_005_BIN_CARTON_INVENTORY.sql
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsPath = Join-Path $scriptDir "bin\Debug\net8.0-windows\wms_settings.json"

if (-not (Test-Path $settingsPath)) {
    $settingsPath = Join-Path $scriptDir "bin\Release\net8.0-windows\wms_settings.json"
}

if (-not (Test-Path $settingsPath)) {
    Write-Host "Settings file not found. Please ensure wms_settings.json exists." -ForegroundColor Red
    exit 1
}

Write-Host "Reading settings from: $settingsPath" -ForegroundColor Cyan

$settingsJson = Get-Content $settingsPath -Raw | ConvertFrom-Json

$dbHost = $settingsJson.DatabaseHost
$dbPort = $settingsJson.DatabasePort
$dbName = $settingsJson.DatabaseName
$dbUser = $settingsJson.DatabaseUserName
$dbPass = $settingsJson.EncryptedPassword

if ([string]::IsNullOrEmpty($dbPass)) {
    $dbPass = $settingsJson.DatabasePassword
}

$migrationFile = Join-Path $scriptDir "MIGRATION_005_BIN_CARTON_INVENTORY.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "Migration file: $migrationFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "Database Connection:" -ForegroundColor Cyan
Write-Host "  Host: $dbHost" -ForegroundColor Gray
Write-Host "  Port: $dbPort" -ForegroundColor Gray
Write-Host "  Database: $dbName" -ForegroundColor Gray
Write-Host "  User: $dbUser" -ForegroundColor Gray
Write-Host ""

$mysqlCmd = Get-Command mysql -ErrorAction SilentlyContinue

if (-not $mysqlCmd) {
    Write-Host "MySQL command line client not found in PATH." -ForegroundColor Red
    Write-Host "Please install MySQL client or run the migration manually." -ForegroundColor Yellow
    exit 1
}

Write-Host "MySQL client found. Executing migration..." -ForegroundColor Green
Write-Host ""

$mysqlArgs = @("-h", $dbHost, "-P", $dbPort, "-u", $dbUser, "-D", $dbName)

if (-not [string]::IsNullOrEmpty($dbPass)) {
    $mysqlArgs += "-p$dbPass"
}

try {
    $sqlContent = Get-Content $migrationFile -Raw
    $sqlContent | & mysql $mysqlArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Migration completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Verifying tables..." -ForegroundColor Cyan
        
        $verifyQuery = "SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '$dbName' AND TABLE_NAME IN ('tabBin', 'tabCarton', 'tabCartonItem', 'tabCartonStock') ORDER BY TABLE_NAME;"
        echo $verifyQuery | & mysql $mysqlArgs
        
        Write-Host ""
        Write-Host "Migration 005: Bin + Carton Level Inventory Support - COMPLETE" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Migration failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Error executing migration: $_" -ForegroundColor Red
    exit 1
}
