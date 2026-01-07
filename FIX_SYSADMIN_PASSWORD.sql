-- Fix sysadmin Login - Set a Password Hash
-- The desktop app requires a password_hash (cannot be NULL)

-- Option 1: Set password to "123" (SHA256 hash)
UPDATE tabUser 
SET password_hash = SHA2('123', 256),
    updated_at = NOW()
WHERE user_code = 'sysadmin';

-- Option 2: Set password to "password" (SHA256 hash)
-- UPDATE tabUser 
-- SET password_hash = SHA2('password', 256),
--     updated_at = NOW()
-- WHERE user_code = 'sysadmin';

-- Option 3: Set password to "admin" (SHA256 hash)
-- UPDATE tabUser 
-- SET password_hash = SHA2('admin', 256),
--     updated_at = NOW()
-- WHERE user_code = 'sysadmin';

-- Verify the change
SELECT 
    user_code,
    name,
    active,
    CASE 
        WHEN password_hash IS NULL THEN 'NULL (will be rejected by desktop app)'
        WHEN password_hash = '' THEN 'Empty hash'
        ELSE CONCAT('✅ Has hash (', LENGTH(password_hash), ' chars)')
    END as password_status,
    LEFT(password_hash, 20) as hash_preview
FROM tabUser
WHERE user_code = 'sysadmin';

-- After running Option 1, you can login with:
-- user_code: sysadmin
-- password: 123

