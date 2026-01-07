# Migration Instructions for tabInboundSession

## Current Table Structure (Desktop App Schema)
- `title` → Needs to be `inbound_session`
- `advance_shipping_notice` → Needs to be `asn_no`
- `started_on` → Needs to be `started_at`
- Missing `device_id` column (required by API)
- `completed_on` → API uses `ended_at` (we'll keep both for compatibility)

## Migration Steps

Run these SQL commands **one at a time** in your MySQL client:

### Step 1: Rename 'title' to 'inbound_session'
```sql
ALTER TABLE tabInboundSession 
  CHANGE COLUMN title inbound_session VARCHAR(100) NOT NULL;
```

### Step 2: Rename 'advance_shipping_notice' to 'asn_no'
```sql
ALTER TABLE tabInboundSession 
  CHANGE COLUMN advance_shipping_notice asn_no VARCHAR(100) NOT NULL;
```

### Step 3: Rename 'started_on' to 'started_at'
```sql
ALTER TABLE tabInboundSession 
  CHANGE COLUMN started_on started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

### Step 4: Add 'device_id' column (required by API)
```sql
ALTER TABLE tabInboundSession 
  ADD COLUMN device_id VARCHAR(100) NOT NULL DEFAULT '' AFTER started_by;
```

### Step 5: Add 'ended_at' column (optional - API uses this)
```sql
ALTER TABLE tabInboundSession 
  ADD COLUMN ended_at TIMESTAMP NULL AFTER started_at;
```

### Step 6: Verify Changes
```sql
DESCRIBE tabInboundSession;
```

You should now see:
- `inbound_session` (PRIMARY KEY)
- `asn_no`
- `started_at`
- `device_id`
- `ended_at`
- All other columns as before

## Alternative: Run All at Once

You can also run the migration file:
```bash
mysql -u root -p wms_desktop < wms-api/src/db/migrations/003_align_inbound_session_schema_simple.sql
```

Or copy the SQL from `003_align_inbound_session_schema_simple.sql` and run it in your MySQL client.

