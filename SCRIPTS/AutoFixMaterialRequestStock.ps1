# ============================================================
# Auto Fix Material Request Stock Sync - PowerShell Script
# This script automatically diagnoses, fixes, and verifies stock sync
# ============================================================

param(
    [string]$ItemCode = "SKU-HAT-301-BLU-OS",
    [string]$Database = "",
    [string]$User = "",
    [string]$Password = "",
    [string]$Host = "localhost",
    [int]$Port = 3306,
    [switch]$AllItems = $false
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Auto Fix Material Request Stock Sync" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if MySQL is available
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysqlPath) {
    Write-Host "ERROR: MySQL command-line client not found!" -ForegroundColor Red
    Write-Host "Please install MySQL client or add it to your PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternatively, you can run the SQL scripts manually:" -ForegroundColor Yellow
    Write-Host "  1. Run SCRIPTS/CheckStockSyncForMaterialRequest.sql" -ForegroundColor Yellow
    Write-Host "  2. Run SCRIPTS/FixMaterialRequestStockSync.sql" -ForegroundColor Yellow
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

# MySQL command
$mysqlCommand = "mysql -h $Host -P $Port -u $User -p$Password $Database"

Write-Host "Step 1: Running diagnostic script..." -ForegroundColor Green
Write-Host ""

# Step 1: Run diagnostic script
$diagnosticScript = "SCRIPTS/CheckStockSyncForMaterialRequest.sql"
if (-not (Test-Path $diagnosticScript)) {
    Write-Host "ERROR: Diagnostic script not found: $diagnosticScript" -ForegroundColor Red
    exit 1
}

# Replace @item_code variable in diagnostic script
$diagnosticContent = Get-Content $diagnosticScript -Raw
$diagnosticContent = $diagnosticContent -replace "SET @item_code = 'SKU-HAT-301-BLU-OS';", "SET @item_code = '$ItemCode';"
$tempDiagnostic = [System.IO.Path]::GetTempFileName()
$diagnosticContent | Out-File -FilePath $tempDiagnostic -Encoding UTF8

try {
    Write-Host "Diagnostic Results:" -ForegroundColor Yellow
    Get-Content $tempDiagnostic | & $mysqlCommand
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Diagnostic script returned exit code $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: Failed to run diagnostic script" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if (Test-Path $tempDiagnostic) {
        Remove-Item $tempDiagnostic -Force
    }
}

Write-Host ""
Write-Host "Step 2: Running fix script..." -ForegroundColor Green
Write-Host ""

# Step 2: Run fix script
$fixScript = "SCRIPTS/FixMaterialRequestStockSync.sql"
if (-not (Test-Path $fixScript)) {
    Write-Host "ERROR: Fix script not found: $fixScript" -ForegroundColor Red
    exit 1
}

try {
    Write-Host "Fix Results:" -ForegroundColor Yellow
    Get-Content $fixScript | & $mysqlCommand
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Fix script completed successfully!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "WARNING: Fix script returned exit code $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR: Failed to run fix script" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Verifying fix..." -ForegroundColor Green
Write-Host ""

# Step 3: Run verification query
$verificationQuery = @"
SELECT 
  '=== VERIFICATION ===' as info;

SELECT 
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
    INNER JOIN (
      SELECT carton_id, item_code, warehouse, bin_location, batch_no, MAX(id) as max_id
      FROM tabCartonStock
      WHERE item_code = cs.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
    ) latest
      ON cs.carton_id = latest.carton_id
      AND cs.item_code = latest.item_code
      AND cs.warehouse = latest.warehouse
      AND cs.bin_location = latest.bin_location
      AND (cs.batch_no = latest.batch_no OR (cs.batch_no IS NULL AND latest.batch_no IS NULL))
      AND cs.id = latest.max_id
    WHERE cs.item_code = i.code
      AND cs.qty > 0
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')) as carton_stock_total,
  CASE 
    WHEN ABS(i.stock_qty - (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
      INNER JOIN (
        SELECT carton_id, item_code, warehouse, bin_location, batch_no, MAX(id) as max_id
        FROM tabCartonStock
        WHERE item_code = cs.item_code
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
        GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
      ) latest
        ON cs.carton_id = latest.carton_id
        AND cs.item_code = latest.item_code
        AND cs.warehouse = latest.warehouse
        AND cs.bin_location = latest.bin_location
        AND (cs.batch_no = latest.batch_no OR (cs.batch_no IS NULL AND latest.batch_no IS NULL))
        AND cs.id = latest.max_id
      WHERE cs.item_code = i.code
        AND cs.qty > 0
        AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY'))) < 0.01
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as sync_status
FROM tabItem i
WHERE i.code = '$ItemCode';
"@

$tempVerification = [System.IO.Path]::GetTempFileName()
$verificationQuery | Out-File -FilePath $tempVerification -Encoding UTF8

try {
    Write-Host "Verification Results:" -ForegroundColor Yellow
    Get-Content $tempVerification | & $mysqlCommand
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Verification completed!" -ForegroundColor Green
    }
} catch {
    Write-Host "WARNING: Verification query failed" -ForegroundColor Yellow
} finally {
    if (Test-Path $tempVerification) {
        Remove-Item $tempVerification -Force
    }
}

Write-Host ""
Write-Host "Step 4: Checking API server status..." -ForegroundColor Green
Write-Host ""

# Step 4: Check if API server is running
$apiProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*wms-api*" }
if ($apiProcess) {
    Write-Host "✅ API server is running (PID: $($apiProcess.Id))" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Restart the API server to apply code changes:" -ForegroundColor Yellow
    Write-Host "  1. Stop the current API server (Ctrl+C or kill process)" -ForegroundColor White
    Write-Host "  2. Run: cd wms-api && npm start" -ForegroundColor White
} else {
    Write-Host "ℹ️  API server is not running" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To start the API server:" -ForegroundColor Yellow
    Write-Host "  cd wms-api && npm start" -ForegroundColor White
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Auto Fix Completed!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Restart the API server (if running) to apply code changes" -ForegroundColor White
Write-Host "  2. Refresh the Items list in the desktop app" -ForegroundColor White
Write-Host "  3. Open Item Location Breakdown for $ItemCode" -ForegroundColor White
Write-Host "  4. Both should now show the same quantity" -ForegroundColor White
Write-Host ""
