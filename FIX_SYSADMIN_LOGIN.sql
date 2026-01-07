-- Fix sysadmin Login - Reset to Dev Mode (Accepts Any Password)

-- Option 1: Reset password_hash to NULL (dev mode - accepts any password)
UPDATE tabUser 
SET password_hash = NULL,
    updated_at = NOW()
WHERE user_code = 'sysadmin';

-- Verify the change
SELECT 
    user_code,
    name,
    active,
    CASE 
        WHEN password_hash IS NULL THEN '✅ Dev mode - accepts any password'
        WHEN password_hash = '' THEN 'Empty hash'
        ELSE CONCAT('Has hash (', LENGTH(password_hash), ' chars)')
    END as password_status
FROM tabUser
WHERE user_code = 'sysadmin';

-- After running this, you can login with:
-- user_code: sysadmin
-- password: ANY password (will be accepted)

