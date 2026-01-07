# Why Logs Aren't Showing - Debug Guide

## Issue
After restarting the server, detailed logs still don't appear in the console.

## Possible Causes

### 1. Server Not Actually Restarted
- Make sure you **completely stopped** the old server (Ctrl+C)
- Check if there are **multiple Node processes** running:
  ```bash
  # Windows PowerShell:
  Get-Process node | Select-Object Id, ProcessName, StartTime
  ```
- Kill all Node processes if needed:
  ```bash
  taskkill /F /IM node.exe
  ```

### 2. Wrong Terminal Window
- Make sure you're looking at the **same terminal** where you ran `npm start`
- The logs will only appear in that terminal window

### 3. Logs Being Redirected
- Check if there's a log file being created
- Look for files like `server.log`, `app.log`, or `wms-api.log`

### 4. Request Not Reaching Login Function
- The route might not be registered correctly
- Check if you see **ANY** logs at all (even the basic request logs)

### 5. Code Not Updated
- Verify the file was actually saved
- Check the file modification time
- Make sure you're editing the correct file

## Quick Test

### Test 1: Verify Server is Running
```bash
curl http://localhost:3000/health
```
Should return: `{"status":"ok"}`

### Test 2: Check if Login Endpoint Exists
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"user_code\":\"sysadmin\",\"password\":\"admin\"}"
```

### Test 3: Run Simple Test Script
```bash
cd wms-api
node test-login-simple.js
```

## What to Check

1. **In the terminal where `npm start` was run, do you see:**
   - `🚀 WMS API Server Started`
   - `✅ Server running on...`
   - Any request logs at all?

2. **When you send the login request, do you see:**
   - `{"level":30,"time":...,"method":"POST","url":"/api/auth/login"...}`
   - This is the basic request log - if you see this, the request is reaching the server

3. **Check the exact terminal output:**
   - Copy and paste the **entire console output** from when you start the server
   - Copy and paste the **entire console output** when you send the login request

## Next Steps

1. **Kill all Node processes:**
   ```bash
   taskkill /F /IM node.exe
   ```

2. **Restart the server:**
   ```bash
   cd wms-api
   npm start
   ```

3. **Watch the console carefully** - you should see:
   ```
   🚀 WMS API Server Started
   ✅ Server running on...
   ```

4. **Send login request** and watch for:
   - Basic request log (JSON format)
   - Detailed logs starting with `===== LOGIN REQUEST =====`

5. **If still no logs**, share:
   - The complete console output from server start
   - The complete console output when sending login request
   - Any error messages

---

**The logs ARE in the code** - we just need to figure out why they're not appearing in your console.

