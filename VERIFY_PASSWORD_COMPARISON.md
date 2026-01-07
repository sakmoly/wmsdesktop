# Verify Password Comparison Logic

## Current Situation
- Database hash: `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` ✅
- MySQL SHA2('admin', 256): `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` ✅
- They match! ✅

But login still fails with "Invalid credentials".

## The Problem

The API code does this comparison:
```javascript
const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
const hashMatch = user.password_hash === sha256Hash;
```

This should work, but since logs aren't showing, we can't see what's happening.

## Quick Fix: Test the Hash Directly

Run this SQL to verify the hash one more time and also test what Node.js generates:

```sql
-- Get the stored hash
SELECT 
    user_code,
    password_hash,
    SHA2('admin', 256) as mysql_hash,
    CASE 
        WHEN password_hash = SHA2('admin', 256) THEN '✅ MATCHES'
        ELSE '❌ DOES NOT MATCH'
    END as status
FROM tabUser
WHERE user_code = 'sysadmin';
```

## Alternative: Set Password to Simple Value

If the hash comparison isn't working, let's try setting the password_hash to the plain text password temporarily to test:

```sql
-- TEMPORARY: Set password_hash to plain text "admin" for testing
UPDATE tabUser 
SET password_hash = 'admin',
    updated_at = NOW()
WHERE user_code = 'sysadmin';
```

Then the API code will match:
```javascript
const plainTextMatch = user.password_hash === password; // Should be true
```

**After testing, set it back to the hash:**
```sql
UPDATE tabUser 
SET password_hash = SHA2('admin', 256),
    updated_at = NOW()
WHERE user_code = 'sysadmin';
```

## Most Likely Issue

Since the hash matches in the database but login fails, and logs aren't showing, the issue is probably:

1. **The password being sent is not exactly "admin"** (maybe has spaces, different case, etc.)
2. **The hash comparison is failing for some reason** (encoding issue, whitespace, etc.)
3. **The code isn't reaching the password validation** (error before that point)

## Solution: Add More Basic Logging

Since detailed logs aren't showing, let's add a very basic log that will definitely appear. But first, let's try the plain text password test above to see if that works.

