# Allow WMS API Server Port 3000 in Windows Firewall
# Run this script as Administrator

Write-Host "Configuring Windows Firewall for WMS API Server..." -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Remove existing rule if it exists
Write-Host "Removing existing rule (if any)..." -ForegroundColor Yellow
Remove-NetFirewallRule -DisplayName "WMS API Server" -ErrorAction SilentlyContinue

# Create new firewall rule
Write-Host "Creating firewall rule for port 3000..." -ForegroundColor Yellow
try {
    New-NetFirewallRule -DisplayName "WMS API Server" `
        -Direction Inbound `
        -LocalPort 3000 `
        -Protocol TCP `
        -Action Allow `
        -Profile Domain,Private,Public `
        -Description "Allow WMS API Server on port 3000 for mobile and desktop app access"
    
    Write-Host "`n✅ Firewall rule created successfully!" -ForegroundColor Green
    Write-Host "Port 3000 is now accessible from network devices." -ForegroundColor Green
} catch {
    Write-Host "`n❌ Error creating firewall rule:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Verify the rule
Write-Host "`nVerifying firewall rule..." -ForegroundColor Cyan
$rule = Get-NetFirewallRule -DisplayName "WMS API Server" -ErrorAction SilentlyContinue
if ($rule) {
    Write-Host "✅ Rule exists:" -ForegroundColor Green
    Write-Host "   Name: $($rule.DisplayName)" -ForegroundColor White
    Write-Host "   Enabled: $($rule.Enabled)" -ForegroundColor White
    Write-Host "   Direction: $($rule.Direction)" -ForegroundColor White
    Write-Host "   Action: $($rule.Action)" -ForegroundColor White
} else {
    Write-Host "⚠️  Rule not found (may need manual creation)" -ForegroundColor Yellow
}

Write-Host "`n📱 Test from mobile device:" -ForegroundColor Cyan
Write-Host "   http://192.168.103.219:3000/health" -ForegroundColor White
Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

