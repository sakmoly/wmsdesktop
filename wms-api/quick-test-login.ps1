# Quick Test Login Endpoint
# Test if login endpoint is accessible

$apiUrl = "http://192.168.103.219:3000"
$loginUrl = "$apiUrl/api/auth/login"

Write-Host "Testing Login Endpoint..." -ForegroundColor Cyan
Write-Host "URL: $loginUrl" -ForegroundColor Yellow
Write-Host ""

# Test health first
Write-Host "1. Testing health endpoint..." -ForegroundColor Cyan
try {
    $healthResponse = Invoke-WebRequest -Uri "$apiUrl/health" -Method GET -UseBasicParsing
    Write-Host "   Status: $($healthResponse.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($healthResponse.Content)" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "2. Testing login endpoint..." -ForegroundColor Cyan

$body = @{
    user_code = "sysadmin"
    password = "test"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-WebRequest -Uri $loginUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    Write-Host "   Status: $($loginResponse.StatusCode)" -ForegroundColor Green
    Write-Host "   Response: $($loginResponse.Content)" -ForegroundColor Green
} catch {
    Write-Host "   Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Yellow
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Error Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✅ Test complete!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 If this works but mobile app doesn't:" -ForegroundColor Yellow
Write-Host "   - Check mobile app API URL configuration" -ForegroundColor Yellow
Write-Host "   - Verify mobile app is using: http://192.168.103.219:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 If this doesn't work:" -ForegroundColor Yellow
Write-Host "   - Check server is running (npm start)" -ForegroundColor Yellow
Write-Host "   - Check firewall allows port 3000" -ForegroundColor Yellow
Write-Host "   - Check network connectivity" -ForegroundColor Yellow

