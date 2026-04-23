# ⚠️ URGENT: Configure ERPNext API Key

## 🚨 Current Status

**The log shows:**
```
INFO: ErpNextItemApiService: Using ApiKey (fallback): eyJhbGciOiJIUzI1NiIs...
```

**This means `ErpNextApiKey` is EMPTY!** The code is falling back to the JWT token, which doesn't work for ERPNext.

---

## ✅ IMMEDIATE FIX (Choose One Method)

### Method 1: Through Settings UI (Recommended)

1. **Open WMS Desktop application**
2. **Go to Settings view**
3. **Find "ERPNext API Key" field** (password field, below "WMS API Key")
4. **Enter:** `9c9cddef8b35474:8c32cc7ca4afbec`
5. **Settings auto-save after 1 second** (you'll see the file update)
6. **Verify:** Check `bin/Debug/net8.0-windows/wms_settings.json` - should show:
   ```json
   "ErpNextApiKey": "9c9cddef8b35474:8c32cc7ca4afbec"
   ```

### Method 2: Manual Edit (Quick Fix)

**If Settings UI doesn't work or you need immediate fix:**

1. **Open file:** `bin/Debug/net8.0-windows/wms_settings.json`
2. **Find line 6:** `"ErpNextApiKey": "",`
3. **Change to:** `"ErpNextApiKey": "9c9cddef8b35474:8c32cc7ca4afbec",`
4. **Save the file**
5. **Restart the application** (to reload settings)

---

## 🧪 Verify It's Working

After configuring, check the logs. You should see:
```
INFO: ErpNextItemApiService: Using ErpNextApiKey: 9c9cddef8b35474...
```

**NOT:**
```
INFO: ErpNextItemApiService: Using ApiKey (fallback): eyJhbGciOiJIUzI1NiIs...
```

---

## 📋 Quick Checklist

- [ ] Opened Settings view
- [ ] Found "ERPNext API Key" field
- [ ] Entered: `9c9cddef8b35474:8c32cc7ca4afbec`
- [ ] Waited 1-2 seconds (for auto-save)
- [ ] Verified `wms_settings.json` shows the key
- [ ] Tested sync - should work now!

---

## 🔍 Troubleshooting

### If Settings UI doesn't save:

1. **Check file permissions** - Make sure `wms_settings.json` is writable
2. **Check error logs** - Look for "Failed to save settings" errors
3. **Use Method 2** (manual edit) instead

### If still getting 401 after configuring:

1. **Verify the key is correct** - Should be exactly: `9c9cddef8b35474:8c32cc7ca4afbec`
2. **Check for extra spaces** - No spaces before/after the key
3. **Restart application** - Settings are loaded on startup
4. **Check logs** - Should show "Using ErpNextApiKey" not "Using ApiKey (fallback)"

---

## ✅ Expected Result

After fixing, when you click "Test Sync" or "Sync Items", you should see:
- ✅ `INFO: ErpNextItemApiService: Using ErpNextApiKey: 9c9cddef8b35474...`
- ✅ `INFO: ErpNextItemApiService: Fetched X item(s) from ERPNext`
- ✅ No more 401 Unauthorized errors!
