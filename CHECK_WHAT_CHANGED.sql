-- Check What Changed - Compare Current State to Last Night

-- 1. Check current state of sysadmin user
SELECT 
    user_code,
    name,
    active,
    password_hash,
    CASE 
        WHEN password_hash IS NULL THEN 'NULL (dev mode - was probably like this last night)'
        WHEN password_hash = '' THEN 'Empty'
        ELSE CONCAT('Has hash (', LENGTH(password_hash), ' chars): ', LEFT(password_hash, 20), '...')
    END as password_status,
    updated_at,
    created_at
FROM tabUser
WHERE user_code = 'sysadmin';

-- 2. Check if there are multiple sysadmin users
SELECT 
    user_code,
    name,
    active,
    password_hash IS NULL as is_null_hash,
    updated_at
FROM tabUser
WHERE user_code LIKE '%sysadmin%' OR name LIKE '%admin%'
ORDER BY updated_at DESC;

-- 3. Restore to working state (NULL password_hash = dev mode)
-- Uncomment to run:
/*
UPDATE tabUser 
SET password_hash = NULL,
    active = 1,
    updated_at = NOW()
WHERE user_code = 'sysadmin';
*/

-- 4. Verify the change
SELECT 
    user_code,
    active,
    CASE 
        WHEN password_hash IS NULL THEN '✅ Dev mode - accepts ANY password'
        ELSE 'Has password hash'
    END as status
FROM tabUser
WHERE user_code = 'sysadmin';

