# Direct MySQL execution script
$mysqlUser = "erppadmin"
$mysqlPassword = "P61nt!"
$database = "wms_desktop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Creating Dirty Flag Table for Self-Healing" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# SQL commands
$sqlCommands = @"
DROP TABLE IF EXISTS tabStockDirtyFlag;

CREATE TABLE tabStockDirtyFlag (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255) NULL,
  recalculated_at TIMESTAMP NULL,
  recalculated_count INT DEFAULT 0,
  UNIQUE KEY uk_item_warehouse (item_code, warehouse),
  INDEX idx_marked_at (marked_at),
  INDEX idx_recalculated_at (recalculated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tabStockDirtyFlag COMMENT = 'Tracks items that need stock recalculation due to discrepancies';
"@

# Try to find mysql.exe
$mysqlPaths = @(
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
    "C:\xampp\mysql\bin\mysql.exe",
    "C:\wamp64\bin\mysql\mysql8.0.xx\bin\mysql.exe",
    "mysql.exe"
)

$mysqlExe = $null
foreach ($path in $mysqlPaths) {
    if ($path -eq "mysql.exe") {
        # Try to find in PATH
        $mysqlExe = Get-Command mysql -ErrorAction SilentlyContinue
        if ($mysqlExe) {
            $mysqlExe = $mysqlExe.Source
            break
        }
    } else {
        if (Test-Path $path) {
            $mysqlExe = $path
            break
        }
    }
}

if (-not $mysqlExe) {
    Write-Host "❌ MySQL executable not found. Please install MySQL or add it to PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Run the SQL manually:" -ForegroundColor Yellow
    Write-Host "  mysql -u $mysqlUser -p$mysqlPassword $database" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Then paste the SQL from SCRIPTS/CreateDirtyFlagTable.sql" -ForegroundColor Gray
    exit 1
}

Write-Host "Using MySQL: $mysqlExe" -ForegroundColor Gray
Write-Host ""

# Execute SQL
try {
    $sqlCommands | & $mysqlExe -u$mysqlUser -p$mysqlPassword $database
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Table created successfully!" -ForegroundColor Green
        
        # Verify
        Write-Host ""
        Write-Host "Verifying table creation..." -ForegroundColor Yellow
        $verifySql = "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '$database' AND TABLE_NAME = 'tabStockDirtyFlag';"
        $verifyResult = $verifySql | & $mysqlExe -u$mysqlUser -p$mysqlPassword $database -N
        
        if ($verifyResult -match "1") {
            Write-Host "✅ Table verified successfully!" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Table may not have been created correctly" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Error creating table (exit code: $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error executing MySQL command:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "✅ Dirty Flag Table Setup Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "The self-healing mechanism is now active." -ForegroundColor Cyan
Write-Host "Items with stock discrepancies will be automatically" -ForegroundColor White
Write-Host "recalculated on the next transaction in the same warehouse." -ForegroundColor White
Write-Host ""
