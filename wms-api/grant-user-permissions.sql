-- Grant Permissions to erppadmin User
-- Run this in MySQL as root user

-- Option 1: Grant access from localhost only
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'localhost' IDENTIFIED BY 'P61nt!';
FLUSH PRIVILEGES;

-- Option 2: Grant access from any host (if connecting from network IP)
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'%' IDENTIFIED BY 'P61nt!';
FLUSH PRIVILEGES;

-- Option 3: If user already exists, just grant privileges
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'localhost';
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'%';
FLUSH PRIVILEGES;

-- Verify user exists and has permissions
SELECT user, host FROM mysql.user WHERE user = 'erppadmin';
SHOW GRANTS FOR 'erppadmin'@'localhost';
SHOW GRANTS FOR 'erppadmin'@'%';

