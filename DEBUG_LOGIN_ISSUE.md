# Debug Login Issue - Hash Matches But Login Fails

## ✅ Verified
- Password hash in database: `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` ✅
- Expected hash (SHA2('admin', 256)): `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` ✅
- **Hash matches!** ✅

## 🔍 Next Steps to Debug

### 1. Check API Server Logs

The API has extensive logging. When you try to login, check the **API server console** for:

```
[timestamp] ===== LOGIN REQUEST =====
[timestamp] ✅ Validation passed. Attempting login for user: sysadmin
[timestamp] 🔍 Querying database for user: sysadmin
[timestamp] 📊 Database query result: Found 1 user(s)
[timestamp] User found: { user_code: 'sysadmin', active: 1, has_password_hash: true }
[timestamp] ❌ PASSWORD VALIDATION FAILED for user: sysadmin
```

**Look for:**
- What password is being received (it's masked in logs, but check the request body)
- Whether password validation is being attempted
- Any errors during hash comparison

### 2. Verify Password Being Sent

Make sure you're sending:
- `user_code`: `sysadmin` (exact, no spaces)
- `password`: `admin` (exact, lowercase, no spaces)

### 3. Test with cURL

Test the login directly with cURL to see the raw API response:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_code": "sysadmin", "password": "admin"}'
```

This will show you the exact API response (not transformed by desktop app).

### 4. Check for Case Sensitivity

Try these variations:
- `admin` (lowercase) ✅
- `Admin` (capitalized)
- `ADMIN` (uppercase)

The hash should only match lowercase `admin`.

### 5. Check for Whitespace

Make sure there are no leading/trailing spaces:
- ❌ `"admin "` (trailing space)
- ❌ `" admin"` (leading space)
- ✅ `"admin"` (no spaces)

### 6. Restart API Server

If the API server was running when you updated the password hash, restart it:

```bash
# Stop the API server (Ctrl+C)
# Then restart it
cd wms-api
npm start
```

### 7. Check API Password Validation Logic

The API compares:
1. `user.password_hash === password` (plain text - shouldn't match)
2. `user.password_hash === crypto.createHash('sha256').update(password).digest('hex')` (SHA256 hash - should match)

If both fail, check:
- Is the password being received correctly?
- Is there any transformation happening to the password?
- Are there any errors in the API logs?

## 🧪 Quick Test

Run this in your SQL editor to verify the hash one more time:

```sql
SELECT 
    user_code,
    password_hash,
    SHA2('admin', 256) as expected,
    CASE 
        WHEN password_hash = SHA2('admin', 256) THEN '✅ MATCH'
        ELSE '❌ NO MATCH'
    END as status
FROM tabUser
WHERE user_code = 'sysadmin';
```

If it shows ✅ MATCH, then the issue is in:
1. The password being sent from desktop app
2. The API password validation logic
3. Some transformation happening to the password

---

**Most Important:** Check the API server console logs - they will show exactly what's happening during password validation!

