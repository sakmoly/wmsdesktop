# How to View Backend Logs When Testing in Postman

**Date**: 2026-01-21

---

## 📌 Important: Logs Are NOT in Postman

**Postman only shows**:
- ✅ API Request (URL, headers, body)
- ✅ API Response (status code, body)

**Backend logs appear in**:
- ✅ **Terminal/Console** where the Node.js server is running
- ✅ **Log files** (if enabled in `.env`)

---

## 🔍 Method 1: View Logs in Terminal (Recommended)

### Step 1: Find the Terminal Running the Server

The backend server must be running in a terminal window. Look for:

**Windows**:
- PowerShell window
- Command Prompt (cmd)
- VS Code Terminal
- Any terminal showing: `Server running on http://0.0.0.0:3000`

**The terminal should show something like**:
```
Server running on http://0.0.0.0:3000
📋 Logging Configuration:
  Error Log: ✅ Enabled (saving to log/Error_log/)
  Detailed Log: ✅ Enabled
```

### Step 2: Send Request from Postman

1. Open Postman
2. Send your request (e.g., `POST /api/putaway/trigger-stock-update`)
3. **Immediately look at the terminal** - logs will appear in real-time

### Step 3: Look for These Log Messages

When you call `POST /api/putaway/trigger-stock-update`, you should see:

```
[Putaway Stock Update] ========================================
[Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called
[Putaway Stock Update] Request body: {
  "putaway_task": "PUT-20260121-0001",
  "user_id": "USER-001"
}
[Putaway Stock Update] Step 10: Getting location and carton_id from putaway lines...
[Putaway Stock Update] ✅ Found location_id from line: A1-R02-L1-B2
[Putaway Stock Update] Step 12: CALLING processPutawayCompletionEvent
[Putaway Completion] 🔵 ENTRY: processPutawayCompletionEvent called
[Putaway Completion] ✅ Found 2 putaway line(s) for task PUT-20260121-0001
[Putaway Completion] ✅ Line 1 passed validation - processing stock update
[Putaway Completion] ✅✅✅ TRANSACTION COMMITTED SUCCESSFULLY
[Putaway Stock Update] ✅ Stock updates completed for task PUT-20260121-0001
```

**OR if there's an error**:
```
[Putaway Stock Update] ❌ CRITICAL ERROR: Invalid location_id: NULL
[Putaway Stock Update] Line details: [
  { item_code: 'SKU-001', location_id: 'NULL', rack: 'TBD', bin: 'TBD' }
]
```

---

## 📁 Method 2: View Log Files (If Enabled)

### Step 1: Enable Logging in `.env`

Edit `wms-api/.env`:

```env
# Enable error logs (saves to log/Error_log/error_YYYY-MM-DD.log)
Error_log=1

# Enable detailed logs (saves to log/detailed_YYYY-MM-DD.log)
Detailed_log=1
```

### Step 2: Restart Server

After changing `.env`, restart the server:
```bash
# Stop server (Ctrl+C)
# Then start again
cd wms-api
npm start
```

### Step 3: Find Log Files

**Location**: `wms-api/log/`

**Files**:
- `log/Error_log/error_2026-01-21.log` - Error logs only
- `log/detailed_2026-01-21.log` - All logs (info, warn, error, debug)

**Open with**:
- Notepad
- VS Code
- Any text editor

---

## 🎯 What to Look For in Logs

### ✅ Success Indicators

Look for these messages:
```
✅ Found location_id from line: A1-R02-L1-B2
✅ Line 1 passed validation - processing stock update
✅✅✅ TRANSACTION COMMITTED SUCCESSFULLY
✅ Stock updates completed for task PUT-20260121-0001
```

### ❌ Error Indicators

Look for these messages:
```
❌ CRITICAL ERROR: Invalid location_id: NULL
❌ SKIPPING line 1/2: missing location
❌ No putaway lines found for task
❌ ERROR in processPutawayCompletionEvent
```

---

## 🔧 Troubleshooting: No Logs Showing

### Problem 1: Detailed Logs Not Enabled

**Symptom**: Only errors show, no info/warn/debug logs

**Fix**: Set `Detailed_log=1` in `wms-api/.env` and restart server

### Problem 2: Server Not Running

**Symptom**: No terminal window with server logs

**Fix**: Start the server:
```bash
cd wms-api
npm start
```

### Problem 3: Wrong Terminal Window

**Symptom**: Can't find logs

**Fix**: 
- Look for terminal showing "Server running on http://0.0.0.0:3000"
- Check all open terminal/PowerShell windows
- If using VS Code, check the "Terminal" panel

### Problem 4: Logs Too Fast/Scrolling

**Fix**: 
- Use terminal scrollback (scroll up to see previous logs)
- Or redirect logs to a file:
  ```bash
  npm start > server.log 2>&1
  ```
  Then open `server.log` in a text editor

---

## 📊 Quick Test: Verify Logging Works

1. **Enable detailed logging** (if not already):
   ```env
   Detailed_log=1
   Error_log=1
   ```

2. **Restart server**

3. **Send a simple request from Postman**:
   ```
   GET http://localhost:3000/health
   ```

4. **Check terminal** - you should see:
   ```
   [INFO] Health check endpoint hit
   ```

If you see this, logging is working! ✅

---

## 🎬 Example: Testing Stock Update Trigger

### Step 1: Open Terminal with Server Running

Make sure you can see the server terminal.

### Step 2: Send Request from Postman

```
POST http://localhost:3000/api/putaway/trigger-stock-update
Content-Type: application/json

{
  "putaway_task": "PUT-20260121-0001",
  "user_id": "USER-001"
}
```

### Step 3: Watch Terminal Immediately

You should see logs appear in real-time:

```
[2026-01-21T10:30:45.123Z] [INFO] [Putaway Stock Update] 🔵 ENTRY: triggerStockUpdate called
[2026-01-21T10:30:45.124Z] [INFO] [Putaway Stock Update] Request body: {
  "putaway_task": "PUT-20260121-0001",
  "user_id": "USER-001"
}
...
```

### Step 4: Copy Logs

- Select text in terminal
- Copy (Ctrl+C)
- Paste into a text file or share with team

---

## 💡 Pro Tips

1. **Keep Terminal Visible**: Don't minimize the terminal window while testing
2. **Scroll Up**: Use terminal scrollback to see previous logs
3. **Search Logs**: Use Ctrl+F in terminal to search for specific keywords
4. **Log Files**: If terminal is too fast, check log files instead
5. **Filter Logs**: Search for `[Putaway Stock Update]` or `[Putaway Completion]` to find relevant logs

---

## 📝 Summary

| Method | Where | When to Use |
|--------|-------|-------------|
| **Terminal** | Console where server runs | ✅ **Best for real-time debugging** |
| **Log Files** | `wms-api/log/` | ✅ Best for reviewing later or sharing |

**Remember**: Postman shows request/response, but **backend logs are in the terminal**! 🎯

---

**END**
