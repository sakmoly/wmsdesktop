# PowerShell script to create dirty flag table
# Uses MySQL command line directly

$mysqlUser = "erppadmin"
$mysqlPassword = "P61nt!"
$database = "wms_desktop"
$mysqlPath = "mysql"  # Assumes mysql is in PATH

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Creating Dirty Flag Table for Self-Healing" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# SQL script
$sqlScript = @"
-- Create table to track items that need stock recalculation
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

-- Add comment
ALTER TABLE tabStockDirtyFlag COMMENT = 'Tracks items that need stock recalculation due to discrepancies';

-- Verify table creation
SELECT 
  'Table created successfully' as Status,
  COUNT(*) as ColumnCount
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = '$database'
  AND TABLE_NAME = 'tabStockDirtyFlag';
"@

# Write SQL to temporary file
$tempFile = [System.IO.Path]::GetTempFileName()
$sqlScript | Out-File -FilePath $tempFile -Encoding UTF8

try {
    Write-Host "Executing SQL script..." -ForegroundColor Yellow
    Write-Host "  User: $mysqlUser" -ForegroundColor Gray
    Write-Host "  Database: $database" -ForegroundColor Gray
    Write-Host ""
    
    # Execute MySQL command
    $mysqlCommand = "& `"$mysqlPath`" -u$mysqlUser -p$mysqlPassword $database -e `"source $tempFile`""
    
    # Use ProcessStartInfo for better error handling
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $mysqlPath
    $processInfo.Arguments = "-u$mysqlUser -p$mysqlPassword $database"
    $processInfo.RedirectStandardInput = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    
    $process.Start() | Out-Null
    $process.StandardInput.WriteLine($sqlScript)
    $process.StandardInput.Close()
    
    $output = $process.StandardOutput.ReadToEnd()
    $errorOutput = $process.StandardError.ReadToEnd()
    
    $process.WaitForExit()
    
    if ($process.ExitCode -eq 0) {
        Write-Host "✅ Table created successfully!" -ForegroundColor Green
        Write-Host ""
        if ($output) {
            Write-Host $output -ForegroundColor White
        }
    } else {
        Write-Host "❌ Error creating table:" -ForegroundColor Red
        Write-Host $errorOutput -ForegroundColor Red
        if ($output) {
            Write-Host $output -ForegroundColor Yellow
        }
        exit 1
    }
    
} catch {
    Write-Host "❌ Error executing MySQL command:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # Clean up temp file
    if (Test-Path $tempFile) {
        Remove-Item $tempFile -Force
    }
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
