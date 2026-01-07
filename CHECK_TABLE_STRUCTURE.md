# Table Structure Check

## Current Status

✅ **Table exists:** `tabInboundSession`
❌ **Table is empty:** 0 rows
✅ **Schema is correct:** Uses `inbound_session` (not `title`)

## Next Steps

### 1. Check What Columns Actually Exist

Run this query to see all columns:

```sql
SHOW COLUMNS FROM tabInboundSession;
```

Or:

```sql
DESCRIBE tabInboundSession;
```

### 2. Check Backend API Database

The "Session Already Exists" dialog is showing data, but your local database is empty. This means:

**The backend API is using a DIFFERENT database!**

Check:
- Backend API database connection settings
- Backend API might be using a different database name
- Backend API might be on a different server

### 3. Verify Backend Database

If you have access to the backend API code, check:
- `wms-api/src/config/database.js` or similar
- What database name the backend uses
- What server/host the backend connects to

### 4. The Dialog Source

The "Session Already Exists" dialog is likely:
- Calling the backend API endpoint (not querying local database)
- The backend API has the session in its database
- Your desktop database is separate and empty

## Solution

You need to either:

1. **Sync from backend to desktop** - Add functionality to fetch sessions from backend API
2. **Use same database** - Configure backend API to use the same database as desktop
3. **Check backend database** - Verify where the backend API is storing sessions

