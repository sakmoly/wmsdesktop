# Fix Database Password Error

## Error
```
Access denied for user 'root'@'Sakeer-Win-Lap' (using password: YES)
```

## Problem
The MySQL password in `.env` file doesn't match the actual MySQL root password.

---

## Solution 1: Update .env File with Correct Password

### Step 1: Find Your MySQL Root Password

**Option A: Check if you remember the password**
- What password did you set when installing MySQL?

**Option B: Check if password is empty**
- Try leaving password blank in `.env`

**Option C: Reset MySQL password** (if you forgot it)
- See Solution 2 below

### Step 2: Edit .env File

1. **Open `.env` file** in `wms-api` directory:
   ```
   wms-api/.env
   ```

2. **Update the password:**
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_actual_mysql_password
   DB_NAME=wms_desktop
   ```

3. **If MySQL has no password, use empty string:**
   ```env
   DB_PASSWORD=
   ```

4. **Save the file**

5. **Restart the server:**
   ```bash
   npm start
   ```

---

## Solution 2: Reset MySQL Root Password

### Method 1: Using MySQL Command Line

1. **Stop MySQL service:**
   ```powershell
   # Run as Administrator
   net stop MySQL80
   # Or
   net stop MySQL
   ```

2. **Start MySQL in safe mode:**
   ```powershell
   mysqld --skip-grant-tables --console
   ```

3. **Open new terminal and connect:**
   ```bash
   mysql -u root
   ```

4. **Reset password:**
   ```sql
   USE mysql;
   UPDATE user SET authentication_string=PASSWORD('newpassword') WHERE User='root';
   FLUSH PRIVILEGES;
   EXIT;
   ```

5. **Restart MySQL service:**
   ```powershell
   net start MySQL80
   ```

### Method 2: Using MySQL Workbench or phpMyAdmin

1. **Connect to MySQL** (if you can access it)
2. **Run SQL:**
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'newpassword';
   FLUSH PRIVILEGES;
   ```

3. **Update `.env` file** with new password

---

## Solution 3: Create New MySQL User (Recommended for Production)

Instead of using root, create a dedicated user:

### Step 1: Connect to MySQL as root
```bash
mysql -u root -p
# Enter your root password when prompted
```

### Step 2: Create New User
```sql
CREATE USER 'wms_user'@'localhost' IDENTIFIED BY 'wms_password123';
GRANT ALL PRIVILEGES ON wms_desktop.* TO 'wms_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 3: Update .env File
```env
DB_USER=wms_user
DB_PASSWORD=wms_password123
```

---

## Solution 4: Test Database Connection

Create a test script to verify connection:

**File: `wms-api/test-db-connection.js`**
```javascript
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log(`Host: ${dbConfig.host}`);
    console.log(`User: ${dbConfig.user}`);
    console.log(`Database: ${dbConfig.database}`);
    console.log(`Password: ${dbConfig.password ? '***' : '(empty)'}\n`);
    
    const connection = await mysql.createConnection(dbConfig);
    console.log('✅ Database connection successful!');
    
    // Test query
    const [rows] = await connection.execute('SELECT DATABASE() as db');
    console.log(`Connected to database: ${rows[0].db}`);
    
    await connection.end();
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error(`Error: ${error.message}`);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Solutions:');
      console.error('1. Check password in .env file');
      console.error('2. Verify MySQL root password');
      console.error('3. Try resetting MySQL password');
      console.error('4. Create new MySQL user (see FIX_DATABASE_PASSWORD.md)');
    }
  }
}

testConnection();
```

**Run:**
```bash
node test-db-connection.js
```

---

## Quick Fix Steps

1. **Check .env file:**
   - Location: `wms-api/.env`
   - Verify `DB_PASSWORD` value

2. **Try common passwords:**
   - Empty password: `DB_PASSWORD=`
   - Common: `DB_PASSWORD=root`
   - Common: `DB_PASSWORD=password`

3. **Test connection:**
   ```bash
   node test-db-connection.js
   ```

4. **If still fails, reset MySQL password** (see Solution 2)

---

## Common MySQL Password Scenarios

### Scenario 1: No Password Set
```env
DB_PASSWORD=
```

### Scenario 2: Password is "root"
```env
DB_PASSWORD=root
```

### Scenario 3: Password is "password"
```env
DB_PASSWORD=password
```

### Scenario 4: Custom Password
```env
DB_PASSWORD=your_custom_password
```

---

## Verify .env File Format

Make sure `.env` file has correct format:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=wms_desktop

# Server Configuration
PORT=3000
HOST=0.0.0.0

# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

**Important:**
- No quotes around values
- No spaces around `=`
- No trailing spaces

---

## After Fixing Password

1. **Restart the server:**
   ```bash
   # Stop server (Ctrl+C)
   npm start
   ```

2. **Verify connection:**
   - Server should start without database errors
   - Health endpoint should work
   - API endpoints should work

---

**Most common fix:** Update `DB_PASSWORD` in `.env` file with the correct MySQL root password.

