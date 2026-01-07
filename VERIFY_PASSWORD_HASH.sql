-- Verify Password Hash for sysadmin
-- This will help diagnose why login is failing

-- 1. Check current password_hash in database
SELECT 
    user_code,
    name,
    active,
    password_hash,
    LENGTH(password_hash) as hash_length,
    LEFT(password_hash, 20) as hash_preview
FROM tabUser
WHERE user_code = 'sysadmin';

-- 2. Generate SHA256 hash of 'admin' in MySQL (should match what's stored)
SELECT 
    SHA2('admin', 256) as mysql_hash,
    LENGTH(SHA2('admin', 256)) as hash_length;

-- 3. Compare - the password_hash should match the SHA2('admin', 256) result
-- If they don't match, the password_hash might be incorrect

-- 4. If hash doesn't match, update it:
-- UPDATE tabUser 
-- SET password_hash = SHA2('admin', 256),
--     updated_at = NOW()
-- WHERE user_code = 'sysadmin';

-- 5. Test with different passwords to find the correct one:
-- SELECT SHA2('123', 256) as hash_123;
-- SELECT SHA2('password', 256) as hash_password;
-- SELECT SHA2('admin', 256) as hash_admin;

