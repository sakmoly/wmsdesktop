# ⚠️ URGENT: Update .env File

## Problem
Server is still using `root` user instead of `erppadmin`.

## Solution: Update .env File NOW

### Step 1: Open .env File
Open this file in a text editor:
```
wms-api/.env
```

### Step 2: Find These Lines
Look for:
```env
DB_USER=root
DB_PASSWORD=...
```

### Step 3: Change To:
```env
DB_USER=erppadmin
DB_PASSWORD=P61nt!
```

### Step 4: Complete .env File Should Look Like:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=erppadmin
DB_PASSWORD=P61nt!
DB_NAME=wms_desktop

# Server Configuration
PORT=3000
HOST=0.0.0.0

# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

### Step 5: Save the File
- Press `Ctrl+S` to save
- Make sure the file is saved

### Step 6: Stop the Server
- Press `Ctrl+C` in the terminal where server is running
- Wait for it to stop completely

### Step 7: Restart the Server
```bash
cd wms-api
npm start
```

### Step 8: Verify
You should see:
- ✅ Server starts without database errors
- ✅ No "Access denied" errors
- ✅ Health endpoint works

---

## If You Can't Find .env File

### Option 1: Create New .env File
1. Create a new file named `.env` in `wms-api` folder
2. Copy this content:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=erppadmin
DB_PASSWORD=P61nt!
DB_NAME=wms_desktop
PORT=3000
HOST=0.0.0.0
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

### Option 2: Check if .env is Hidden
- In Windows File Explorer, enable "Show hidden files"
- Look for `.env` file in `wms-api` folder

---

## Verify .env is Being Read

Run this command to check:
```bash
cd wms-api
node check-env-config.js
```

It should show:
```
DB_USER: erppadmin
DB_PASSWORD: ***
```

If it still shows `root`, the .env file is not being read correctly.

---

## Common Mistakes

❌ **Wrong:**
```env
DB_USER="erppadmin"    # Don't use quotes
DB_PASSWORD="P61nt!"   # Don't use quotes
```

✅ **Correct:**
```env
DB_USER=erppadmin
DB_PASSWORD=P61nt!
```

❌ **Wrong:**
```env
DB_USER = erppadmin    # No spaces around =
```

✅ **Correct:**
```env
DB_USER=erppadmin
```

---

## Still Having Issues?

1. **Check file location:** `.env` must be in `wms-api` folder (same folder as `package.json`)
2. **Check file name:** Must be exactly `.env` (not `.env.txt` or `env`)
3. **Restart server:** Always restart after changing .env
4. **Check for typos:** `erppadmin` not `erpadmin` or `erppadmin1`

