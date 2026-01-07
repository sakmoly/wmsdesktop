-- Check Login Issue - Diagnostic Queries
-- Run these queries to diagnose login problems

-- 1. Check if user exists and is active
SELECT 
    user_code,
    name,
    role,
    active,
    CASE 
        WHEN password_hash IS NULL THEN 'No password hash (dev mode - accepts any password)'
        WHEN password_hash = '' THEN 'Empty password hash'
        ELSE CONCAT('Has password hash (', LENGTH(password_hash), ' chars)')
    END as password_status,
    created_at,
    updated_at
FROM tabUser
WHERE user_code = 'USER-786249'  -- Replace with the user_code you're trying to login with
   OR user_code LIKE '%786249%'
   OR name LIKE '%786249%';

-- 2. List all active users
SELECT 
    user_code,
    name,
    role,
    active,
    CASE 
        WHEN password_hash IS NULL THEN 'NULL (dev mode)'
        WHEN password_hash = '' THEN 'Empty'
        ELSE 'Has hash'
    END as password_status
FROM tabUser
WHERE active = 1
ORDER BY user_code;

-- 3. List all users (including inactive)
SELECT 
    user_code,
    name,
    role,
    active,
    CASE 
        WHEN password_hash IS NULL THEN 'NULL (dev mode)'
        WHEN password_hash = '' THEN 'Empty'
        ELSE 'Has hash'
    END as password_status
FROM tabUser
ORDER BY active DESC, user_code;

-- 4. Check for common user_code patterns
SELECT 
    user_code,
    name,
    active,
    role
FROM tabUser
WHERE user_code LIKE 'USER-%'
   OR user_code LIKE 'sysadmin%'
   OR user_code LIKE 'admin%'
ORDER BY user_code;

-- 5. Create a test user (if needed)
-- Uncomment and modify as needed:
/*
INSERT INTO tabUser (user_code, name, password_hash, role, active, created_at, updated_at)
VALUES ('USER-786249', 'Test User', NULL, 'operator', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
    active = 1,
    password_hash = NULL,  -- NULL means dev mode accepts any password
    updated_at = NOW();
*/

-- 6. Activate a user (if user exists but is inactive)
-- Uncomment and modify as needed:
/*
UPDATE tabUser 
SET active = 1,
    updated_at = NOW()
WHERE user_code = 'USER-786249';
*/

-- 7. Reset password hash to NULL (for dev mode - accepts any password)
-- Uncomment and modify as needed:
/*
UPDATE tabUser 
SET password_hash = NULL,
    updated_at = NOW()
WHERE user_code = 'USER-786249';
*/


