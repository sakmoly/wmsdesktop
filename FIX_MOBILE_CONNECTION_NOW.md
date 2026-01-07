# Fix Mobile App Connection - Step by Step

## Problem
Mobile app cannot connect to `http://192.168.103.219:3000`

## Root Cause
**Windows Firewall is blocking port 3000** from external devices (mobile app)

---

## ✅ Solution: Allow Port 3000 in Windows Firewall

### Method 1: PowerShell (Fastest) ⚡

1. **Open PowerShell as Administrator:**
   - Press `Win + X`
   - Select **"Windows PowerShell (Admin)"** or **"Terminal (Admin)"**

2. **Run this command:**
   ```powershell
   New-NetFirewallRule -DisplayName "WMS API Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

3. **Verify it worked:**
   ```powershell
   Get-NetFirewallRule -DisplayName "WMS API Server"
   ```

4. **Test from mobile device:**
   - Open mobile browser
   - Go to: `http://192.168.103.219:3000/health`
   - Should see: `{"status":"ok","message":"WMS API Server is running"}`

---

### Method 2: Windows Firewall GUI (Visual)

1. **Open Windows Defender Firewall:**
   - Press `Win + R`
   - Type: `wf.msc` → Press Enter

2. **Create Inbound Rule:**
   - Click **"Inbound Rules"** in left panel
   - Click **"New Rule..."** in right panel

3. **Rule Type:**
   - Select **"Port"** → Click **Next**

4. **Protocol and Ports:**
   - Select **TCP**
   - Select **"Specific local ports"**
   - Enter: `3000`
   - Click **Next**

5. **Action:**
   - Select **"Allow the connection"**
   - Click **Next**

6. **Profile:**
   - Check all three: **Domain**, **Private**, **Public**
   - Click **Next**

7. **Name:**
   - Name: `WMS API Server`
   - Description: `Allow WMS API Server on port 3000 for mobile app access`
   - Click **Finish**

---

## 🧪 Test Connection

### Step 1: Test from Mobile Browser
1. Open mobile browser (Chrome, Safari, etc.)
2. Navigate to: `http://192.168.103.219:3000/health`
3. **Expected:** You should see JSON response:
   ```json
   {"status":"ok","message":"WMS API Server is running"}
   ```

### Step 2: Test from Mobile App
1. Open mobile app
2. Try to login or connect
3. Should now work!

---

## ✅ Verification Checklist

- [ ] Firewall rule created for port 3000
- [ ] Can access `http://192.168.103.219:3000/health` from mobile browser
- [ ] Mobile app API URL is: `http://192.168.103.219:3000` (no `/api`)
- [ ] Mobile device and server are on same WiFi network
- [ ] Server is running (check server console)

---

## 🔍 If Still Not Working

### Check 1: Same Network
- Mobile device and server must be on **same WiFi network**
- Check WiFi name matches on both devices

### Check 2: Router AP Isolation
- Some routers block device-to-device communication
- Access router admin (usually `192.168.1.1`)
- Look for **"AP Isolation"** or **"Client Isolation"**
- **Disable** it

### Check 3: Mobile App API URL
- Open mobile app settings
- Verify API Base URL is exactly: `http://192.168.103.219:3000`
- No trailing slash
- No `/api` suffix (that's for desktop app)

### Check 4: Server Status
- Check server console shows: `WMS API Server running on 0.0.0.0:3000`
- Server should show network IP addresses

---

## 📱 Mobile App API URL Format

**Correct:**
```
http://192.168.103.219:3000
```

**Wrong:**
```
http://192.168.103.219:3000/api  ❌ (desktop app uses this)
http://localhost:3000            ❌ (won't work from mobile)
https://192.168.103.219:3000     ❌ (unless using SSL)
```

---

## 🚀 Quick Command Reference

```powershell
# Add firewall rule (Run as Admin)
New-NetFirewallRule -DisplayName "WMS API Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow

# Check if rule exists
Get-NetFirewallRule -DisplayName "WMS API Server"

# Test connection
Test-NetConnection -ComputerName 192.168.103.219 -Port 3000
```

---

**After adding the firewall rule, restart the mobile app and try connecting again!**

