# .env File Setup Instructions

## ✅ .env File Created

The `.env` file has been created with default values. 

## ⚠️ Important: Update Database Password

The default password is set to `root`. **You must update this** if your MySQL root password is different.

### How to Update:

1. **Open the `.env` file** in the `wms-api` directory
2. **Find this line:**
   ```
   DB_PASSWORD=root
   ```
3. **Change it to your actual MySQL password:**
   ```
   DB_PASSWORD=your_actual_password
   ```

### Current Configuration:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root          ← UPDATE THIS if your password is different
DB_NAME=wms_desktop

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d
```

## 🔍 Verify Your MySQL Password

If you're not sure what your MySQL password is:

1. **Check your desktop app settings:**
   - Open the WMS Desktop app
   - Go to Settings
   - Check the Database Password field

2. **Or test MySQL connection:**
   ```bash
   mysql -u root -p
   ```
   Enter your password when prompted

3. **If you forgot the password:**
   - You may need to reset MySQL root password
   - Or create a new MySQL user for the API

## 🚀 After Updating

1. **Save the `.env` file**
2. **Restart the server:**
   ```bash
   npm start
   ```

## 🔒 Security Note

- The `.env` file is in `.gitignore` (not committed to git)
- Never commit passwords to version control
- Change `JWT_SECRET` to a strong random string in production

