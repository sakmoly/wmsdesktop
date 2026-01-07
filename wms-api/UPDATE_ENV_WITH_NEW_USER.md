# Update .env File with New MySQL User

## New User Credentials
- **Username:** `erppadmin`
- **Password:** `P61nt!`

## Steps to Fix

### Step 1: Update .env File

Open `wms-api/.env` file and update these lines:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=erppadmin
DB_PASSWORD=P61nt!
DB_NAME=wms_desktop
```

**Important:** 
- No quotes around the password
- Special characters like `!` should work fine in .env files
- Make sure there are no extra spaces

### Step 2: Grant Permissions to New User

Connect to MySQL as root and run:

```sql
-- Grant all privileges on wms_desktop database
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'localhost';
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'%';
FLUSH PRIVILEGES;
```

**If connecting from network IP (192.168.103.219), you need:**
```sql
-- Grant for network access
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'%' IDENTIFIED BY 'P61nt!';
FLUSH PRIVILEGES;
```

### Step 3: Test Connection

Run the test script:
```bash
cd wms-api
node test-new-user.js
```

### Step 4: Restart Server

After successful connection test:
```bash
npm start
```

---

## Common Issues

### Issue 1: User doesn't have permissions
**Error:** `Access denied for user 'erppadmin'@'localhost'`

**Solution:** Run the GRANT commands above

### Issue 2: User can't connect from network IP
**Error:** `Access denied for user 'erppadmin'@'192.168.103.219'`

**Solution:** Grant permissions for `'%'` (any host):
```sql
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'erppadmin'@'%';
FLUSH PRIVILEGES;
```

### Issue 3: Special characters in password
**Error:** Password not working

**Solution:** 
- Make sure password in .env has no quotes
- Special characters like `!` should work
- If still issues, try escaping or use different password

---

## Verify User Exists

Connect to MySQL as root:
```sql
SELECT user, host FROM mysql.user WHERE user = 'erppadmin';
```

Should show:
```
+-----------+-----------+
| user      | host      |
+-----------+-----------+
| erppadmin | localhost |
| erppadmin | %         |
+-----------+-----------+
```

---

## Complete .env File Example

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=erppadmin
DB_PASSWORD=P61nt!
DB_NAME=wms_desktop

# Server Configuration
PORT=3000
HOST=0.0.0.0

# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

