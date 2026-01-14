# PowerShell script to get API token and update settings
# Usage: .\SCRIPTS\GetApiToken.ps1 -UserCode "USER-172188" -Password "password123"

param(
    [Parameter(Mandatory=$true)]
    [string]$UserCode,
    
    [Parameter(Mandatory=$true)]
    [string]$Password,
    
    [string]$ApiUrl = "http://localhost:3000",
    [string]$SettingsPath = "bin/Debug/net8.0-windows/wms_settings.json"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Get API Token and Update Settings" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login to get token
Write-Host "Step 1: Logging in to get token..." -ForegroundColor Yellow
Write-Host "   User Code: $UserCode" -ForegroundColor Gray
Write-Host "   API URL: $ApiUrl/api/auth/login" -ForegroundColor Gray
Write-Host ""

try {
    $loginBody = @{
        user_code = $UserCode
        password = $Password
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$ApiUrl/api/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody `
        -ErrorAction Stop

    if ($loginResponse.success -and $loginResponse.data.access_token) {
        $token = $loginResponse.data.access_token
        Write-Host "   ✅ Login successful!" -ForegroundColor Green
        Write-Host "   Token: $($token.Substring(0, [Math]::Min(50, $token.Length)))..." -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "   ❌ Login failed: No token in response" -ForegroundColor Red
        Write-Host "   Response: $($loginResponse | ConvertTo-Json)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
    exit 1
}

# Step 2: Test token
Write-Host "Step 2: Testing token..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    $testResponse = Invoke-RestMethod -Uri "$ApiUrl/api/transaction-history?limit=1" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host "   ✅ Token is valid!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "   ⚠️  Token test failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   (This might be okay if there's no data)" -ForegroundColor Gray
    Write-Host ""
}

# Step 3: Update settings file
Write-Host "Step 3: Updating settings file..." -ForegroundColor Yellow
Write-Host "   Settings file: $SettingsPath" -ForegroundColor Gray

if (-not (Test-Path $SettingsPath)) {
    Write-Host "   ❌ Settings file not found: $SettingsPath" -ForegroundColor Red
    Write-Host "   Please check the path and try again" -ForegroundColor Yellow
    exit 1
}

try {
    # Read current settings
    $settingsJson = Get-Content $SettingsPath -Raw | ConvertFrom-Json
    
    # Update API key
    $settingsJson.ApiKey = $token
    
    # Save updated settings
    $settingsJson | ConvertTo-Json -Depth 10 | Set-Content $SettingsPath
    
    Write-Host "   ✅ Settings file updated!" -ForegroundColor Green
    Write-Host ""
    
    # Also update Release build if it exists
    $releasePath = $SettingsPath -replace "Debug", "Release"
    if (Test-Path $releasePath) {
        Write-Host "   Updating Release build settings..." -ForegroundColor Gray
        $releaseSettings = Get-Content $releasePath -Raw | ConvertFrom-Json
        $releaseSettings.ApiKey = $token
        $releaseSettings | ConvertTo-Json -Depth 10 | Set-Content $releasePath
        Write-Host "   ✅ Release settings updated!" -ForegroundColor Green
        Write-Host ""
    }
} catch {
    Write-Host "   ❌ Failed to update settings: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. RESTART the desktop app completely" -ForegroundColor White
Write-Host "2. Open Transaction History view" -ForegroundColor White
Write-Host "3. Click 'Load All' button" -ForegroundColor White
Write-Host "4. Data should appear!" -ForegroundColor White
Write-Host ""
