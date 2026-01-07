# install-windows-service.ps1
# Install WMS API as Windows Service using NSSM
# Run as Administrator

param(
    [string]$NssmPath = "C:\nssm\win64",
    [string]$ServiceName = "WMS-API"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  WMS API - Windows Service Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Get script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiPath = $scriptPath

# Check if NSSM exists
$nssmExe = Join-Path $NssmPath "nssm.exe"
if (-not (Test-Path $nssmExe)) {
    Write-Host "NSSM not found at: $NssmPath" -ForegroundColor Red
    Write-Host "Please download NSSM from: https://nssm.cc/download" -ForegroundColor Yellow
    Write-Host "Extract to: $NssmPath" -ForegroundColor Yellow
    exit 1
}

# Find Node.js
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "Node.js not found in PATH!" -ForegroundColor Red
    Write-Host "Please ensure Node.js is installed and in PATH." -ForegroundColor Yellow
    exit 1
}
$nodeExe = $nodePath.Source
Write-Host "Found Node.js at: $nodeExe" -ForegroundColor Green

# Check if service already exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "`nService '$ServiceName' already exists." -ForegroundColor Yellow
    $response = Read-Host "Remove existing service? (Y/N)"
    if ($response -eq 'Y' -or $response -eq 'y') {
        Write-Host "Removing existing service..." -ForegroundColor Yellow
        & $nssmExe stop $ServiceName
        Start-Sleep -Seconds 2
        & $nssmExe remove $ServiceName confirm
        Write-Host "Service removed." -ForegroundColor Green
    } else {
        Write-Host "Installation cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Install service
Write-Host "`nInstalling Windows Service..." -ForegroundColor Yellow
Write-Host "  Service Name: $ServiceName" -ForegroundColor Cyan
Write-Host "  Node.js: $nodeExe" -ForegroundColor Cyan
Write-Host "  Script: $apiPath\src\server.js" -ForegroundColor Cyan
Write-Host "  Working Directory: $apiPath" -ForegroundColor Cyan

& $nssmExe install $ServiceName $nodeExe "src/server.js"
& $nssmExe set $ServiceName AppDirectory $apiPath
& $nssmExe set $ServiceName DisplayName "WMS API Server"
& $nssmExe set $ServiceName Description "WMS Backend API Service"
& $nssmExe set $ServiceName Start SERVICE_AUTO_START

# Set environment variables if .env exists
if (Test-Path "$apiPath\.env") {
    Write-Host "`nSetting environment variables from .env file..." -ForegroundColor Yellow
    Get-Content "$apiPath\.env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            & $nssmExe set $ServiceName AppEnvironmentExtra "$key=$value"
        }
    }
}

# Start service
Write-Host "`nStarting service..." -ForegroundColor Yellow
& $nssmExe start $ServiceName

Start-Sleep -Seconds 2

# Check status
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq 'Running') {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  Service Installed Successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Service Status: $($service.Status)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor Cyan
    Write-Host "  Get-Service $ServiceName        - Check status" -ForegroundColor White
    Write-Host "  Start-Service $ServiceName      - Start service" -ForegroundColor White
    Write-Host "  Stop-Service $ServiceName        - Stop service" -ForegroundColor White
    Write-Host "  Restart-Service $ServiceName    - Restart service" -ForegroundColor White
    Write-Host ""
    Write-Host "To remove service:" -ForegroundColor Yellow
    Write-Host "  & `"$nssmExe`" remove $ServiceName confirm" -ForegroundColor White
} else {
    Write-Host "`nService installed but not running." -ForegroundColor Yellow
    Write-Host "Check Windows Event Viewer for errors." -ForegroundColor Yellow
}

