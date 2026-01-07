# Database Clarification

## Are Backend and Desktop Using the Same Database?

**Yes, they likely are!** Both the desktop app and backend API connect to the same MySQL database.

### Desktop App Database Connection
- **Host:** From `WmsSettings.DatabaseHost` (default: `localhost`)
- **Database:** From `WmsSettings.DatabaseName` (default: `wms_desktop`)
- **Port:** From `WmsSettings.DatabasePort` (default: `3306`)

### Backend API Database Connection
- **Host:** Usually `localhost` or configured in backend settings
- **Database:** Usually the same database name (e.g., `wms_desktop`)
- **Port:** Usually `3306`

## Why the Session Shows in Dialog But Not in Desktop List?

If they're using the **same database**, the issue is likely:

### 1. **Schema Mismatch** (Most Likely)
The desktop app query might be looking for the wrong column names:

- **Backend API stores:** `inbound_session` (column name)
- **Desktop app might be looking for:** `title` or `inbound_session` (depending on schema detection)

### 2. **Query Issue**
The desktop app query might have a condition that filters out the session:
- Wrong WHERE clause
- Wrong column name in ORDER BY
- Schema detection returning wrong column names

### 3. **Data Format Mismatch**
The session might exist but in a different format:
- ASN format: `ASN-0002` vs `ASN-00002` (4-digit vs 5-digit)
- Session ID format mismatch

## How to Verify

### Step 1: Check What's Actually in the Database

Run this query directly in your MySQL client:

```sql
-- Check all sessions
SELECT * FROM tabInboundSession;

-- Check specific session
SELECT * FROM tabInboundSession 
WHERE inbound_session = 'SESSION-ASN0002-DEVICE001-USER172188'
   OR title = 'SESSION-ASN0002-DEVICE001-USER172188';
```

### Step 2: Check Column Names

```sql
-- See what columns actually exist
SHOW COLUMNS FROM tabInboundSession;
```

### Step 3: Check Desktop App Query

The desktop app uses schema detection. Check the logs to see:
- What columns it detected
- What query it's executing
- What results it's getting

## Most Likely Issue

Since the dialog shows the session but the desktop list doesn't, the desktop app's query is probably:
1. Using wrong column names (schema detection issue)
2. Filtering out the session somehow
3. Not finding the session due to format mismatch

## Solution

1. **Check the actual database** - Run the SQL queries above
2. **Check desktop app logs** - See what query it's executing
3. **Compare column names** - Make sure desktop query matches actual table structure
4. **Check ASN format** - Make sure ASN numbers match (4-digit vs 5-digit)

The session **does exist** in the database (since the dialog shows it), but the desktop app's query isn't finding it.

