-- QUICK FIX: Create/Update User for Login Testing
-- This creates a user that accepts ANY password (development mode)

-- Option 1: Create new user (replace USER-786249 with your user_code)
INSERT INTO tabUser (user_code, name, password_hash, role, active, created_at, updated_at)
VALUES ('USER-786249', 'Test User', NULL, 'operator', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE 
    active = 1,
    password_hash = NULL,  -- NULL = dev mode (accepts any password)
    updated_at = NOW();

-- Option 2: If user exists but is inactive, activate it
UPDATE tabUser 
SET active = 1, 
    password_hash = NULL,  -- Set to NULL for dev mode
    updated_at = NOW()
WHERE user_code = 'USER-786249';

-- Option 3: Check if user exists
SELECT 
    user_code,
    name,
    role,
    active,
    CASE 
        WHEN password_hash IS NULL THEN '✅ Dev mode - accepts any password'
        WHEN password_hash = '' THEN 'Empty hash'
        ELSE CONCAT('Has hash (', LENGTH(password_hash), ' chars)')
    END as password_status
FROM tabUser
WHERE user_code = 'USER-786249';

-- After running this, try logging in with:
-- user_code: USER-786249
-- password: ANY password (will be accepted if password_hash is NULL)

