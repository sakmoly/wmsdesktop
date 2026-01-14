# ============================================================
# Auto Fix Stock Discrepancy - PowerShell Script
# This script runs the SQL fix automatically
# ============================================================

param(
    [string]$ItemCode = "SKU-HAT-301-BLU-OS",
    [switch]$AllItems = $false,
    [string]$Database = "",
    [string]$User = "",
    [string]$Password = "",
    [string]$Host = "localhost",
    [int]$Port = 3306
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Auto Fix Stock Discrepancy" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if MySQL is available
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysqlPath) {
    Write-Host "ERROR: MySQL command-line client not found!" -ForegroundColor Red
    Write-Host "Please install MySQL client or add it to your PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternatively, you can run the SQL script manually:" -ForegroundColor Yellow
    if ($AllItems) {
        Write-Host "  mysql -u [user] -p [database] < SCRIPTS/AutoFixAllItemsStock.sql" -ForegroundColor Yellow
    } else {
        Write-Host "  mysql -u [user] -p [database] < SCRIPTS/AutoFixStockDiscrepancy.sql" -ForegroundColor Yellow
        Write-Host "  (Edit the script to change @item_code variable)" -ForegroundColor Yellow
    }
    exit 1
}

# Get database credentials if not provided
if ([string]::IsNullOrEmpty($Database)) {
    $Database = Read-Host "Enter database name"
}

if ([string]::IsNullOrEmpty($User)) {
    $User = Read-Host "Enter MySQL username"
}

if ([string]::IsNullOrEmpty($Password)) {
    $SecurePassword = Read-Host "Enter MySQL password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

# Determine which script to run
$scriptPath = if ($AllItems) {
    "SCRIPTS/AutoFixAllItemsStock.sql"
} else {
    "SCRIPTS/AutoFixStockDiscrepancy.sql"
}

# Check if script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

# For single item fix, replace @item_code variable
if (-not $AllItems) {
    $scriptContent = Get-Content $scriptPath -Raw
    $scriptContent = $scriptContent -replace "SET @item_code = 'SKU-HAT-301-BLU-OS';", "SET @item_code = '$ItemCode';"
    $tempScript = [System.IO.Path]::GetTempFileName()
    $scriptContent | Out-File -FilePath $tempScript -Encoding UTF8
    $scriptPath = $tempScript
}

Write-Host "Running fix script..." -ForegroundColor Green
Write-Host "  Script: $scriptPath" -ForegroundColor Gray
if (-not $AllItems) {
    Write-Host "  Item: $ItemCode" -ForegroundColor Gray
} else {
    Write-Host "  Scope: All Items" -ForegroundColor Gray
}
Write-Host "  Database: $Database" -ForegroundColor Gray
Write-Host ""

# Run MySQL command
$mysqlCommand = "mysql -h $Host -P $Port -u $User -p$Password $Database"
try {
    Get-Content $scriptPath | & $mysqlCommand
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "Fix completed successfully!" -ForegroundColor Green
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "  1. Refresh the Items list in the desktop app" -ForegroundColor White
        Write-Host "  2. Refresh the Item Location Breakdown" -ForegroundColor White
        Write-Host "  3. Both should now show the same quantity" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "ERROR: MySQL command failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to run MySQL command" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # Clean up temp file if created
    if ($tempScript -and (Test-Path $tempScript)) {
        Remove-Item $tempScript -Force
    }
}
