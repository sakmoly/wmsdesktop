# setup-pm2-service.ps1
# Setup WMS API as PM2 Service
# Run as Administrator for full functionality

param(
    [switch]$SkipStartup
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  WMS API - PM2 Service Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check if PM2 is installed
Write-Host "Checking PM2 installation..." -ForegroundColor Yellow
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Host "PM2 not found. Installing globally..." -ForegroundColor Yellow
    npm install -g pm2
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install PM2. Please install manually: npm install -g pm2" -ForegroundColor Red
        exit 1
    }
    Write-Host "PM2 installed successfully!" -ForegroundColor Green
} else {
    $pm2Version = pm2 --version
    Write-Host "PM2 found (version $pm2Version)" -ForegroundColor Green
}

# Create logs directory
Write-Host "`nCreating logs directory..." -ForegroundColor Yellow
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
    Write-Host "Logs directory created." -ForegroundColor Green
} else {
    Write-Host "Logs directory already exists." -ForegroundColor Green
}

# Stop existing instance if running
Write-Host "`nChecking for existing PM2 processes..." -ForegroundColor Yellow
$existing = pm2 list | Select-String "wms-api"
if ($existing) {
    Write-Host "Stopping existing wms-api process..." -ForegroundColor Yellow
    pm2 stop wms-api 2>&1 | Out-Null
    pm2 delete wms-api 2>&1 | Out-Null
    Write-Host "Existing process stopped." -ForegroundColor Green
}

# Start API with PM2
Write-Host "`nStarting WMS API with PM2..." -ForegroundColor Yellow
if (Test-Path "ecosystem.config.js") {
    pm2 start ecosystem.config.js
} else {
    pm2 start src/server.js --name wms-api --log-date-format "YYYY-MM-DD HH:mm:ss Z"
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "WMS API started successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed to start WMS API. Check the error messages above." -ForegroundColor Red
    exit 1
}

# Save PM2 configuration
Write-Host "`nSaving PM2 configuration..." -ForegroundColor Yellow
pm2 save
Write-Host "Configuration saved." -ForegroundColor Green

# Setup startup (optional)
if (-not $SkipStartup) {
    Write-Host "`nSetting up PM2 startup..." -ForegroundColor Yellow
    Write-Host "PM2 will provide a command to run. Please run it as Administrator." -ForegroundColor Cyan
    Write-Host ""
    $startupCmd = pm2 startup
    Write-Host $startupCmd -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Copy and run the command above in an Administrator PowerShell window." -ForegroundColor Yellow
}

# Display status
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  pm2 status              - Check service status" -ForegroundColor White
Write-Host "  pm2 logs wms-api        - View logs" -ForegroundColor White
Write-Host "  pm2 restart wms-api     - Restart service" -ForegroundColor White
Write-Host "  pm2 stop wms-api        - Stop service" -ForegroundColor White
Write-Host "  pm2 monit               - Monitor in real-time" -ForegroundColor White
Write-Host ""
Write-Host "Current status:" -ForegroundColor Cyan
pm2 status

