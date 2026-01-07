@echo off
echo ========================================
echo WMS API Server - Firewall Setup
echo ========================================
echo.
echo Adding Windows Firewall rule for port 3000...
echo.

netsh advfirewall firewall delete rule name="WMS API Server" >nul 2>&1
netsh advfirewall firewall add rule name="WMS API Server" dir=in action=allow protocol=TCP localport=3000

if %ERRORLEVEL% EQU 0 (
    echo ✅ Firewall rule added successfully!
    echo.
    echo The server is now accessible from other devices on your network.
) else (
    echo ❌ Failed to add firewall rule.
    echo Please run this script as Administrator.
    echo.
)

echo.
pause
