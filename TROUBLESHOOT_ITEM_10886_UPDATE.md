# Troubleshoot Item 10886 Update Issue

## 🔍 Problem
Item code **10886** name changed in ERPNext from "VEGA SLIP RUB SOLE 07" to "VEGA SLIP RUB SOLE 07-1", but WMS Desktop still shows old name after sync.

## 🔍 Investigation

### Issue Found
The log shows **"210886"** was updated, but **NOT "10886"**. This means item 10886 might not be getting synced.

**Possible Reasons:**

1. **Incremental Sync Skipping It**
   - If you used "Incremental Sync" and `LastItemSyncTimestamp` is **newer** than when you changed the item (1 hour ago), it will skip it
   - **Solution:** Use **Full Sync** instead

2. **Item Not Matching Filter**
   - The sync filters by `custom_dcs = MENFOTSLP`
   - If item 10886 doesn't have this value, it won't be fetched
   - **Solution:** Check item in ERPNext has `custom_dcs = MENFOTSLP`

3. **Item Code Mismatch**
   - Database might have item with different code
   - **Solution:** Check database for item code variations

---

## ✅ Diagnostic Steps

### Step 1: Check if Item is in Database

Run this SQL query:
```sql
SELECT code, name, updated_at 
FROM tabItem 
WHERE code = '10886' OR code LIKE '%10886%';
```

**Expected:** Should show item with code "10886" and current name

### Step 2: Check ERPNext Item

1. Open item 10886 in ERPNext
2. Verify:
   - `custom_dcs` field = `MENFOTSLP` ✅
   - `item_name` = `VEGA SLIP RUB SOLE 07-1` ✅
   - `modified` timestamp is recent ✅

### Step 3: Run Full Sync (Not Incremental)

1. Open Items view
2. Click "Sync Items"
3. **Choose "No" (Full Sync)** - This ensures ALL items are synced
4. Wait for completion

### Step 4: Check Logs for Item 10886

After sync, check `ErrorLogs/error_YYYY-MM-DD.log` for:
```
ItemSyncService: Processing item 10886 - Name: 'VEGA SLIP RUB SOLE 07-1', Modified: '...'
ItemSyncService: Updated existing item: 10886 - VEGA SLIP RUB SOLE 07-1
```

**If you see:**
- ✅ "Updated existing item: 10886" → Database was updated
- ❌ No mention of 10886 → Item wasn't fetched from ERPNext

---

## 🔧 Quick Fix

### Option 1: Force Full Sync

1. **Clear LastItemSyncTimestamp** (forces full sync):
   - Open `wms_settings.json`
   - Set `"LastItemSyncTimestamp": null` or remove the field
   - Save file
   - Restart application
   - Run sync (will do full sync)

### Option 2: Manual Database Update (Temporary)

If you need immediate fix:
```sql
UPDATE tabItem 
SET name = 'VEGA SLIP RUB SOLE 07-1',
    updated_at = CURRENT_TIMESTAMP
WHERE code = '10886';
```

Then refresh the Items view in WMS Desktop.

---

## 🧪 Test After Fix

1. **Run Full Sync**
2. **Check logs** for: `ItemSyncService: Updated existing item: 10886`
3. **Verify database:**
   ```sql
   SELECT code, name FROM tabItem WHERE code = '10886';
   ```
   Should show: `VEGA SLIP RUB SOLE 07-1`
4. **Refresh Items view** - Should show new name

---

## 📝 Why This Happens

**Incremental Sync Logic:**
- Only syncs items with `modified > LastItemSyncTimestamp`
- If you changed item 1 hour ago, but last sync was 2 hours ago, incremental sync will pick it up
- If you changed item 1 hour ago, but last sync was 30 minutes ago, incremental sync will **skip it**

**Solution:** Always use **Full Sync** when testing, or ensure `LastItemSyncTimestamp` is older than your changes.

---

## ✅ Summary

**Most Likely Cause:** Incremental sync skipped the item because `LastItemSyncTimestamp` is newer than the item's modified date.

**Solution:**
1. Use **Full Sync** (choose "No" when prompted)
2. Or clear `LastItemSyncTimestamp` in settings
3. Check logs to verify item 10886 was processed
4. Verify database shows new name
