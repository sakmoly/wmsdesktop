# Troubleshoot Login Error: "Invalid credentials"

## 🔍 Error Analysis

The error shows:
```
ERROR ❌ Login error (/api/auth/login): Invalid credentials
ERROR Login error: [Error: Invalid credentials]
ERROR ❌ Login failed (/api/auth/login): {"error": {"code": "AUTH_FAILED", ...}}
```

**Note:** The desktop app shows `AUTH_FAILED` but the API returns `AUTH_INVALID`. This is just a transformation in the desktop app - the root cause is the same.

## 📋 Possible Causes

1. **User doesn't exist** in `tabUser` table
2. **User is inactive** (`active != 1`)
3. **Password validation failed** (if password_hash exists)
4. **Wrong user_code** being sent

## 🔧 Step-by-Step Troubleshooting

### Step 1: Check Server Logs

The API has extensive logging. Check the **API server console** for detailed logs:

**Look for these log messages:**
```
[timestamp] ===== LOGIN REQUEST =====
[timestamp] ✅ Validation passed. Attempting login for user: <user_code>
[timestamp] 🔍 Querying database for user: <user_code>
[timestamp] 📊 Database query result: Found X user(s)
```

**If user not found:**
```
[timestamp] ❌ USER NOT FOUND or INACTIVE: <user_code>
```

**If password fails:**
```
[timestamp] ❌ PASSWORD VALIDATION FAILED for user: <user_code>
```

### Step 2: Check Database

Run the SQL queries in `CHECK_LOGIN_ISSUE.sql`:

```sql
-- Check if user exists and is active
SELECT 
    user_code,
    name,
    role,
    active,
    CASE 
        WHEN password_hash IS NULL THEN 'No password hash (dev mode - accepts any password)'
        WHEN password_hash = '' THEN 'Empty password hash'
        ELSE CONCAT('Has password hash (', LENGTH(password_hash), ' chars)')
    END as password_status
FROM tabUser
WHERE user_code = 'USER-786249';  -- Replace with your user_code
```

### Step 3: Verify User is Active

The login query requires `active = 1`:

```sql
-- Check if user is active
SELECT user_code, name, active 
FROM tabUser 
WHERE user_code = 'USER-786249';

-- If active = 0, activate the user:
UPDATE tabUser 
SET active = 1, updated_at = NOW()
WHERE user_code = 'USER-786249';
```

### Step 4: Check Password Hash

**Development Mode (password_hash = NULL):**
- If `password_hash IS NULL`, **any password is accepted** ✅
- This is for development/testing

**Production Mode (password_hash exists):**
- Password must match the hash
- Currently supports SHA256 hashes

### Step 5: Create/Update Test User

**Option A: Create user with NULL password_hash (dev mode - accepts any password)**
```sql
INSERT INTO tabUser (user_code, name, password_hash, role, active, created_at, updated_at)
VALUES ('USER-786249', 'Test User', NULL, 'operator', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
    active = 1,
    password_hash = NULL,  -- NULL = dev mode (accepts any password)
    updated_at = NOW();
```

**Option B: Create user with password hash**
```sql
-- Generate SHA256 hash of password "123"
-- You can use: SELECT SHA2('123', 256) as hash;

INSERT INTO tabUser (user_code, name, password_hash, role, active, created_at, updated_at)
VALUES ('USER-786249', 'Test User', SHA2('123', 256), 'operator', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
    active = 1,
    password_hash = SHA2('123', 256),
    updated_at = NOW();
```

### Step 6: Verify Request Format

**Correct Request:**
```json
POST /api/auth/login
Content-Type: application/json

{
  "user_code": "USER-786249",
  "password": "any_password"  // If password_hash is NULL, any password works
}
```

**Common Mistakes:**
- ❌ Using `username` instead of `user_code`
- ❌ Wrong endpoint URL
- ❌ Missing Content-Type header

## 🧪 Quick Test

### Test 1: Check if user exists
```sql
SELECT * FROM tabUser WHERE user_code = 'USER-786249';
```

### Test 2: Activate user (if exists but inactive)
```sql
UPDATE tabUser SET active = 1 WHERE user_code = 'USER-786249';
```

### Test 3: Reset to dev mode (accepts any password)
```sql
UPDATE tabUser SET password_hash = NULL WHERE user_code = 'USER-786249';
```

### Test 4: Test login with cURL
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user_code": "USER-786249", "password": "any_password"}'
```

## 📊 Expected Server Logs for Success

```
[timestamp] ===== LOGIN REQUEST =====
[timestamp] ✅ Validation passed. Attempting login for user: USER-786249
[timestamp] 🔍 Querying database for user: USER-786249
[timestamp] 📊 Database query result: Found 1 user(s)
[timestamp] User found: { user_code: 'USER-786249', active: 1, has_password_hash: false }
[timestamp] ✅ Password validated successfully
[timestamp] 🔑 Generating JWT token...
[timestamp] ✅ LOGIN SUCCESS for user: USER-786249
```

## ❌ Expected Server Logs for Failure

**User not found or inactive:**
```
[timestamp] 📊 Database query result: Found 0 user(s)
[timestamp] ❌ USER NOT FOUND or INACTIVE: USER-786249
```

**Password validation failed:**
```
[timestamp] 📊 Database query result: Found 1 user(s)
[timestamp] ❌ PASSWORD VALIDATION FAILED for user: USER-786249
```

## ✅ Solution Summary

1. **Check server logs** - They will tell you exactly what's wrong
2. **Verify user exists** - Run SQL query
3. **Ensure user is active** - `active = 1`
4. **For dev mode** - Set `password_hash = NULL` (accepts any password)
5. **Test with cURL** - Verify the endpoint works

---

**Most Common Fix:**
```sql
-- Create/update user for development (accepts any password)
INSERT INTO tabUser (user_code, name, password_hash, role, active, created_at, updated_at)
VALUES ('USER-786249', 'Test User', NULL, 'operator', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
    active = 1,
    password_hash = NULL,
    updated_at = NOW();
```

Then try logging in with **any password** - it should work!


