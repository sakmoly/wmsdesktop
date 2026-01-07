# Mobile App Connection Troubleshooting Guide

## Issue: "Cannot connect to the server" on Physical Device

The mobile app shows: **"Cannot connect to the server"** with API URL `http://192.168.103.219:3000`

---

## ✅ Server Status Check

**Server is running:** ✅ (Confirmed - listening on `0.0.0.0:3000`)

---

## 🔍 Common Causes & Solutions

### 1. Windows Firewall Blocking Port 3000 ⚠️ **MOST COMMON**

**Solution: Allow port 3000 in Windows Firewall**

#### Method 1: Using PowerShell (Run as Administrator)
```powershell
# Allow inbound connections on port 3000
New-NetFirewallRule -DisplayName "WMS API Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

#### Method 2: Using Windows Firewall GUI
1. Open **Windows Defender Firewall** (search in Start menu)
2. Click **Advanced settings**
3. Click **Inbound Rules** → **New Rule**
4. Select **Port** → **Next**
5. Select **TCP** → Enter port **3000** → **Next**
6. Select **Allow the connection** → **Next**
7. Check all profiles (Domain, Private, Public) → **Next**
8. Name it "WMS API Server" → **Finish**

#### Method 3: Quick Test (Temporary)
```powershell
# Temporarily disable firewall for testing (NOT RECOMMENDED FOR PRODUCTION)
netsh advfirewall set allprofiles state off
# Test connection, then re-enable:
netsh advfirewall set allprofiles state on
```

---

### 2. Server and Mobile Device Not on Same Network

**Check:**
- Is the mobile device connected to the **same WiFi network** as the server?
- Is the server IP address correct? (`192.168.103.219`)

**Verify IP Address:**
```powershell
# On server machine
ipconfig
# Look for IPv4 Address under your active network adapter
```

**Test from Mobile Device:**
- Open mobile browser
- Navigate to: `http://192.168.103.219:3000/health`
- Should see: `{"status":"ok","message":"WMS API Server is running"}`

---

### 3. Mobile App API URL Configuration

**Check the mobile app is using the correct API URL:**

The mobile app should use:
```
http://192.168.103.219:3000
```

**NOT:**
- ❌ `http://192.168.103.219:3000/api` (desktop app uses this)
- ❌ `http://localhost:3000`
- ❌ `https://192.168.103.219:3000` (unless using SSL)

**Verify in Mobile App:**
1. Check mobile app settings/configuration
2. Ensure API Base URL is: `http://192.168.103.219:3000`
3. No trailing slash

---

### 4. Network Isolation / AP Isolation

Some WiFi routers have **AP Isolation** or **Client Isolation** enabled, which prevents devices on the same network from communicating with each other.

**Solution:**
1. Access router admin panel (usually `192.168.1.1` or `192.168.0.1`)
2. Look for **AP Isolation** or **Client Isolation** setting
3. **Disable** it
4. Save and restart router

---

### 5. Server Not Accessible from Network

**Test from another device on the same network:**

```bash
# From another computer/device on same network
curl http://192.168.103.219:3000/health

# Or use browser:
# http://192.168.103.219:3000/health
```

**If this fails:**
- Firewall is blocking (see Solution #1)
- Server not bound correctly (should be `0.0.0.0:3000`)

---

## 🔧 Step-by-Step Troubleshooting

### Step 1: Verify Server is Running
```powershell
# Check if server is listening
netstat -an | findstr :3000
# Should show: TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING
```

### Step 2: Test from Server Machine
```powershell
# Test locally
Invoke-WebRequest -Uri http://localhost:3000/health
# Should return: {"status":"ok","message":"WMS API Server is running"}
```

### Step 3: Test from Mobile Device Browser
1. Open mobile browser
2. Go to: `http://192.168.103.219:3000/health`
3. If this works → Mobile app configuration issue
4. If this fails → Network/firewall issue

### Step 4: Check Firewall
```powershell
# Check firewall rules for port 3000
netsh advfirewall firewall show rule name=all | findstr 3000
```

### Step 5: Allow Port in Firewall
```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "WMS API Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## 📱 Mobile App Specific Checks

### 1. Verify API URL in Mobile App
- Settings → API Configuration
- Base URL should be: `http://192.168.103.219:3000`
- No `/api` suffix (that's for desktop app)

### 2. Check Mobile App Logs
- Look for connection errors
- Check if it's trying to connect to the correct URL
- Verify authentication token is being sent

### 3. Test Login Endpoint
The mobile app should call:
```
POST http://192.168.103.219:3000/api/auth/login
```

Test this from mobile browser or using a REST client.

---

## 🧪 Quick Test Script

Create a test file `test-server-connection.js`:

```javascript
import fetch from 'node-fetch';

const SERVER_URL = 'http://192.168.103.219:3000';

async function testConnection() {
  try {
    console.log(`Testing connection to ${SERVER_URL}...`);
    
    const response = await fetch(`${SERVER_URL}/health`);
    const data = await response.json();
    
    console.log('✅ Server is accessible!');
    console.log('Response:', data);
  } catch (error) {
    console.error('❌ Cannot connect to server');
    console.error('Error:', error.message);
    console.log('\nPossible causes:');
    console.log('1. Firewall blocking port 3000');
    console.log('2. Server not running');
    console.log('3. Wrong IP address');
    console.log('4. Network connectivity issue');
  }
}

testConnection();
```

Run: `node test-server-connection.js`

---

## ✅ Verification Checklist

- [ ] Server is running (`netstat` shows port 3000 listening)
- [ ] Server is bound to `0.0.0.0:3000` (not just `127.0.0.1`)
- [ ] Windows Firewall allows port 3000
- [ ] Mobile device and server are on same WiFi network
- [ ] IP address is correct (`192.168.103.219`)
- [ ] Can access `http://192.168.103.219:3000/health` from mobile browser
- [ ] Mobile app API URL is configured correctly
- [ ] No AP Isolation on router

---

## 🚀 Most Likely Solution

**90% of the time, it's Windows Firewall blocking the connection.**

**Quick Fix:**
```powershell
# Run PowerShell as Administrator
New-NetFirewallRule -DisplayName "WMS API Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

Then test from mobile device browser: `http://192.168.103.219:3000/health`

---

## 📞 Still Not Working?

If all above steps fail:

1. **Check router settings** - AP Isolation, Port Forwarding
2. **Try different network** - Use mobile hotspot or different WiFi
3. **Check server logs** - See if requests are reaching the server
4. **Use network monitoring tool** - Wireshark to see if packets are being sent/received
5. **Test with another device** - Try from another computer on same network

