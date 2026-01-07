# Database Schema Check Instructions

## Current Situation

The migration errors indicate:
- ❌ Columns `title`, `advance_shipping_notice`, `started_on` **don't exist** (may already be renamed)
- ✅ Columns `device_id` and `ended_at` **already exist** (good!)

This means the table structure is different than expected. We need to check what it actually looks like.

## Step 1: Check Current Schema

Run this SQL command to see the current table structure:

```sql
DESCRIBE tabInboundSession;
```

Or:

```sql
SHOW COLUMNS FROM tabInboundSession;
```

## Step 2: Share the Results

Please share the output so we can:
1. See what the primary key column is actually named
2. See what the ASN column is actually named  
3. See what the timestamp column is actually named
4. Confirm what columns exist

## Step 3: Based on Results

Once we know the actual structure, we can:

### If columns already have correct names:
- ✅ `inbound_session` (PRIMARY KEY)
- ✅ `asn_no`
- ✅ `started_at`
- ✅ `device_id`
- ✅ `ended_at`

Then **no migration needed** - the schema is already correct!

### If columns have different names:
We'll create a custom migration based on the actual column names.

## Alternative: Quick Check Query

You can also run this to check specific columns:

```sql
-- Check if inbound_session column exists
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabInboundSession' 
  AND COLUMN_NAME IN ('inbound_session', 'title', 'session_id');

-- Check if asn_no column exists
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabInboundSession' 
  AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice');

-- Check if started_at column exists
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabInboundSession' 
  AND COLUMN_NAME IN ('started_at', 'started_on');
```

## What We're Looking For

The API code expects these columns:
1. `inbound_session` VARCHAR(100) PRIMARY KEY
2. `asn_no` VARCHAR(100) NOT NULL
3. `transfer_order` VARCHAR(100) NULL
4. `dock` VARCHAR(50) NOT NULL
5. `status` VARCHAR(50) DEFAULT 'Draft'
6. `started_by` VARCHAR(100) NOT NULL
7. `device_id` VARCHAR(100) NOT NULL ✅ (already exists)
8. `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
9. `ended_at` TIMESTAMP NULL ✅ (already exists)
10. `created_at` TIMESTAMP
11. `updated_at` TIMESTAMP

**Please run `DESCRIBE tabInboundSession;` and share the results!**

