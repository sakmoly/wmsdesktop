# Session Sync - Quick Fix Instructions

## The Problem

Session sync is not working because the database schema needs to be updated.

## ✅ Solution: Run Migration Script

**Run this command:**

```bash
cd "D:\Development Project\Printechs WMS\wms-api"
npm run fix-inbound-session
```

This script will:
1. ✅ Add `completed_cartons` column if missing
2. ✅ Add `total_cartons` column if missing  
3. ✅ Add `completed_on` column if missing
4. ✅ Fix `dock` column to allow NULL
5. ✅ Fix any column name mismatches (e.g., `title` → `inbound_session`)

---

## Alternative: Manual SQL Fix

If you prefer to run SQL manually, execute these commands:

```sql
-- Add completed_cartons column
ALTER TABLE tabInboundSession 
  ADD COLUMN completed_cartons INT DEFAULT 0 AFTER status;

-- Add total_cartons column
ALTER TABLE tabInboundSession 
  ADD COLUMN total_cartons INT DEFAULT 0 AFTER completed_cartons;

-- Add completed_on column
ALTER TABLE tabInboundSession 
  ADD COLUMN completed_on TIMESTAMP NULL AFTER ended_at;

-- Fix dock to allow NULL (for sync operations)
ALTER TABLE tabInboundSession 
  MODIFY COLUMN dock VARCHAR(50) NULL;
```

---

## After Running Migration

1. **Restart the API server** (if it's running)
2. **Test the sync endpoints** using the mobile app or curl commands

---

## Still Not Working?

Check the troubleshooting guide: `SESSION_SYNC_TROUBLESHOOTING.md`

Common issues:
- Database schema still not updated → Run migration again
- Authentication errors → Check token in request header
- Validation errors → Check request body format
- Endpoint not found → Restart API server

