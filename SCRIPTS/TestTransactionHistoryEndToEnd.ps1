# PowerShell script to test Transaction History API end-to-end
# This script tests the API directly and verifies the response format

param(
    [string]$ApiUrl = "http://localhost:3000",
    [string]$ApiKey = ""
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Transaction History API - End-to-End Test" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if API URL and Key are provided
if ([string]::IsNullOrEmpty($ApiUrl) -or [string]::IsNullOrEmpty($ApiKey)) {
    Write-Host "❌ ERROR: API URL and Key required" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\TestTransactionHistoryEndToEnd.ps1 -ApiUrl 'http://localhost:3000' -ApiKey 'your-api-key'" -ForegroundColor White
    Write-Host ""
    Write-Host "Or set environment variables:" -ForegroundColor Yellow
    Write-Host "  `$env:API_URL = 'http://localhost:3000'" -ForegroundColor White
    Write-Host "  `$env:API_KEY = 'your-api-key'" -ForegroundColor White
    exit 1
}

Write-Host "API URL: $ApiUrl" -ForegroundColor Yellow
Write-Host "API Key: $($ApiKey.Substring(0, [Math]::Min(10, $ApiKey.Length)))..." -ForegroundColor Yellow
Write-Host ""

# Test 1: Health Check
Write-Host "1. Testing API Health Check..." -ForegroundColor Cyan
try {
    $healthResponse = Invoke-RestMethod -Uri "$ApiUrl/api/health" -Method Get -ErrorAction Stop
    Write-Host "   ✅ API is running" -ForegroundColor Green
    Write-Host "   Status: $($healthResponse.status)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ API is not responding: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: Get Transaction History (No Filters)
Write-Host "2. Testing GET /api/transaction-history (no filters)..." -ForegroundColor Cyan
try {
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "application/json"
    }
    
    $url = "$ApiUrl/api/transaction-history?limit=10"
    Write-Host "   URL: $url" -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
    
    if ($response.ok -eq $true) {
        $count = $response.data.Count
        Write-Host "   ✅ API returned data" -ForegroundColor Green
        Write-Host "   Records found: $count" -ForegroundColor Gray
        
        if ($count -gt 0) {
            Write-Host "   Sample record:" -ForegroundColor Gray
            $sample = $response.data[0]
            Write-Host "     ID: $($sample.id)" -ForegroundColor Gray
            Write-Host "     Transaction #: $($sample.transaction_number)" -ForegroundColor Gray
            Write-Host "     Type: $($sample.transaction_type)" -ForegroundColor Gray
            Write-Host "     Item: $($sample.item_code)" -ForegroundColor Gray
            Write-Host "     Date: $($sample.transaction_date)" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  No records found (this might be expected if no transactions exist)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ❌ API returned error: $($response.error.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ API call failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
}
Write-Host ""

# Test 3: Get Transaction History (With Item Code Filter)
Write-Host "3. Testing GET /api/transaction-history (with item_code filter)..." -ForegroundColor Cyan
try {
    $url = "$ApiUrl/api/transaction-history?item_code=SKU-HAT-301-BLU-OS&limit=10"
    Write-Host "   URL: $url" -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
    
    if ($response.ok -eq $true) {
        $count = $response.data.Count
        Write-Host "   ✅ API returned data" -ForegroundColor Green
        Write-Host "   Records found: $count" -ForegroundColor Gray
    } else {
        Write-Host "   ❌ API returned error: $($response.error.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ API call failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Get Transaction History (With Date Filter)
Write-Host "4. Testing GET /api/transaction-history (with date filter)..." -ForegroundColor Cyan
try {
    $fromDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $toDate = (Get-Date).ToString("yyyy-MM-dd")
    $url = "$ApiUrl/api/transaction-history?from_date=$fromDate&to_date=$toDate&limit=10"
    Write-Host "   URL: $url" -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
    
    if ($response.ok -eq $true) {
        $count = $response.data.Count
        Write-Host "   ✅ API returned data" -ForegroundColor Green
        Write-Host "   Records found: $count" -ForegroundColor Gray
    } else {
        Write-Host "   ❌ API returned error: $($response.error.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ API call failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Verify Response Format
Write-Host "5. Verifying response format..." -ForegroundColor Cyan
try {
    $url = "$ApiUrl/api/transaction-history?limit=1"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
    
    if ($response.ok -eq $true -and $response.data.Count -gt 0) {
        $record = $response.data[0]
        $requiredFields = @("id", "transaction_id", "transaction_date", "transaction_type", "item_code", "warehouse", "qty_change")
        $missingFields = @()
        
        foreach ($field in $requiredFields) {
            if (-not $record.PSObject.Properties.Name -contains $field) {
                $missingFields += $field
            }
        }
        
        if ($missingFields.Count -eq 0) {
            Write-Host "   ✅ Response format is correct" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Missing required fields: $($missingFields -join ', ')" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "   ⚠️  Could not verify format (no data available)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. If API tests pass, check desktop app Error Log" -ForegroundColor White
Write-Host "2. Verify API endpoint URL in desktop app settings" -ForegroundColor White
Write-Host "3. Verify API key in desktop app settings" -ForegroundColor White
Write-Host "4. Rebuild desktop app and test Transaction History view" -ForegroundColor White
Write-Host ""
