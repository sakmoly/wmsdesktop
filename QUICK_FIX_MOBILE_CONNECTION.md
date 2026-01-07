# Quick Fix: Mobile App Cannot Connect to Server

## Issue
Mobile app shows: **"Cannot connect to the server"**  
API URL: `http://192.168.103.219:3000`

## ✅ Server Status
- Server is running ✅
- Listening on `0.0.0.0:3000` ✅
- Port test successful ✅

## 🔧 Solution: Allow Port 3000 in Windows Firewall

### Option 1: Run PowerShell Script (Easiest)

1. **Open PowerShell as Administrator:**
   - Right-click PowerShell → "Run as Administrator"

2. **Run the script:**
   ```powershell
   cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"
   .\allow-firewall-port.ps1
   ```

### Option 2: Manual Firewall Rule (If script doesn't work)

1. **Open Windows Defender Firewall:**
   - Press `Win + R`
   - Type: `wf.msc` → Enter

2. **Create Inbound Rule:**
   - Click **Inbound Rules** → **New Rule...**
   - Select **Port** → **Next**
   - Select **TCP** → Enter port **3000** → **Next**
   - Select **Allow the connection** → **Next**
   - Check all (Domain, Private, Public) → **Next**
   - Name: **WMS API Server** → **Finish**

### Option 3: Quick PowerShell Command (Run as Administrator)

```powershell
New-NetFirewallRule -DisplayName "WMS API Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## 🧪 Test Connection

### From Mobile Device Browser:
1. Open mobile browser
2. Go to: `http://192.168.103.219:3000/health`
3. Should see: `{"status":"ok","message":"WMS API Server is running"}`

### From Mobile App:
1. Ensure API URL is: `http://192.168.103.219:3000` (no `/api` suffix)
2. Try logging in again

---

## ✅ Verification

After adding firewall rule, test:

```powershell
# Test from server machine
Test-NetConnection -ComputerName 192.168.103.219 -Port 3000
# Should show: TcpTestSucceeded : True
```

---

## 📱 Mobile App Configuration

**Ensure mobile app API URL is:**
```
http://192.168.103.219:3000
```

**NOT:**
- ❌ `http://192.168.103.219:3000/api` (that's for desktop)
- ❌ `http://localhost:3000`
- ❌ `https://192.168.103.219:3000` (unless using SSL)

---

## 🔍 Still Not Working?

1. **Check if devices are on same network:**
   - Server and mobile device must be on same WiFi

2. **Test from mobile browser first:**
   - If browser works but app doesn't → App configuration issue
   - If browser doesn't work → Network/firewall issue

3. **Check router settings:**
   - Some routers have "AP Isolation" that blocks device-to-device communication
   - Disable AP Isolation in router settings

4. **Try different network:**
   - Use mobile hotspot or different WiFi to test

---

**Most likely fix:** Run the firewall script or manually allow port 3000 in Windows Firewall.

