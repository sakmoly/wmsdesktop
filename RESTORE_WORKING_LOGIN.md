# Restore Working Login - It Was Working Last Night!

## What Likely Happened

If login was working last night but not now, one of these probably changed:

1. **Password hash was set** - Last night `password_hash` was probably `NULL` (dev mode), now it has a hash
2. **User was deactivated** - `active` might have been set to `0`
3. **Password hash was changed** - The hash might have been updated to a different value

## Quick Fix: Restore to Working State

### Option 1: Reset to Dev Mode (Accepts Any Password)

```sql
-- Reset sysadmin to dev mode (accepts ANY password)
UPDATE tabUser 
SET password_hash = NULL,
    active = 1,
    updated_at = NOW()
WHERE user_code = 'sysadmin';

-- Verify
SELECT 
    user_code,
    name,
    active,
    CASE 
        WHEN password_hash IS NULL THEN '✅ Dev mode (accepts any password)'
        ELSE 'Has password hash'
    END as status
FROM tabUser
WHERE user_code = 'sysadmin';
```

**After this, you can login with ANY password!**

### Option 2: Set a Known Password

If you remember what password worked last night, set it:

```sql
-- Set password to "123" (or whatever worked last night)
UPDATE tabUser 
SET password_hash = SHA2('123', 256),
    active = 1,
    updated_at = NOW()
WHERE user_code = 'sysadmin';
```

Then login with password: `123`

### Option 3: Check What Changed

```sql
-- Check current state
SELECT 
    user_code,
    name,
    active,
    password_hash,
    CASE 
        WHEN password_hash IS NULL THEN 'NULL (dev mode)'
        WHEN password_hash = '' THEN 'Empty'
        ELSE CONCAT('Has hash: ', LEFT(password_hash, 20), '...')
    END as status,
    updated_at
FROM tabUser
WHERE user_code = 'sysadmin';
```

## Most Likely Solution

Since it was working last night, the password_hash was probably `NULL`. Run this:

```sql
UPDATE tabUser 
SET password_hash = NULL,
    active = 1,
    updated_at = NOW()
WHERE user_code = 'sysadmin';
```

Then try logging in with **any password** - it should work!

