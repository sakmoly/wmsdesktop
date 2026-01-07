# Test Login Directly - Debug Steps

## Issue
Login is failing but detailed logs aren't showing. The server needs to be restarted to pick up the new logging code.

## Steps to Debug

### 1. **RESTART THE API SERVER** (Critical!)

The code changes won't take effect until you restart the server:

```bash
# In the terminal where the API is running:
# Press Ctrl+C to stop it

# Then restart:
cd wms-api
npm start
```

### 2. Try Login Again

After restarting, try the login request again in Postman:
- `user_code`: `sysadmin`
- `password`: `admin`

### 3. Check Console Output

You should now see detailed logs like:

```
[timestamp] ===== LOGIN REQUEST =====
[timestamp] ✅ Validation passed. Attempting login for user: sysadmin
[timestamp] 🔍 Querying database for user: sysadmin
[timestamp] 📊 Database query result: Found 1 user(s)
[timestamp] User found: { user_code: 'sysadmin', active: 1, has_password_hash: true }
[timestamp] 🔐 Password validation details:
[timestamp]   - Password received: "admin" (length: 5)
[timestamp]   - Stored hash: 8c6976e5b5410415bde9...
[timestamp]   - Computed SHA256: 8c6976e5b5410415bde9...
[timestamp]   - Plain text match: ❌
[timestamp]   - Hash match: ✅ or ❌
[timestamp]   - Final result: ✅ VALID or ❌ INVALID
```

### 4. If Logs Still Don't Appear

If you still don't see the detailed logs after restarting, check:

1. **Is the server actually running the updated code?**
   - Make sure you're looking at the correct terminal window
   - Check if there are multiple API servers running

2. **Check for errors before the logging code:**
   - Look for any error messages in the console
   - The code might be failing before reaching the password validation

3. **Verify the request is reaching the endpoint:**
   - You should at least see: `[timestamp] ===== LOGIN REQUEST =====`
   - If you don't see this, the request isn't reaching the login function

### 5. Alternative: Add Log at Very Start

If logs still don't appear, the issue might be that the function isn't being called. Check the routes:

```javascript
// In wms-api/src/routes/authRoutes.js
// Should have:
router.post('/login', login);
```

---

**Most Important:** Restart the API server! The new logging code won't work until you restart.

