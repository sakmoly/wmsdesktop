# Item 10886 Not Updating - Diagnosis

## 🔍 Problem
Item 10886 name changed in ERPNext from "VEGA SLIP RUB SOLE 07" to "VEGA SLIP RUB SOLE 07-1", but WMS Desktop still shows old name.

## 🔍 Investigation Results

### Log Analysis
**Search Result:** No logs found for "Processing item 10886" or "Updated existing item: 10886"

**This means:** Item 10886 is **NOT being fetched** from ERPNext during sync.

---

## 🚨 Root Causes

### Cause 1: Item Not Matching Filter (Most Likely)

The sync filters by `custom_dcs = MENFOTSLP`. If item 10886 doesn't have this value, it won't be fetched.

**Check in ERPNext:**
1. Open item 10886 in ERPNext
2. Check the `custom_dcs` field
3. If it's NOT `MENFOTSLP`, that's why it's not syncing

**Solution Options:**
- **Option A:** Update item 10886 in ERPNext to have `custom_dcs = MENFOTSLP`
- **Option B:** Change the filter in code (if you want to sync different items)

### Cause 2: Item Modified Date Too Old

If you used **Incremental Sync**:
- Only syncs items where `modified > LastItemSyncTimestamp`
- Your `LastItemSyncTimestamp`: `2025-11-30T01:07:44`
- If item 10886's `modified` date is older than this, incremental sync skips it

**Solution:** Use **Full Sync** instead of Incremental Sync

### Cause 3: Item Not in Fetched Pages

With thousands of items, item 10886 might be in a page that wasn't fetched (if sync was interrupted).

**Solution:** Run Full Sync to ensure all pages are fetched

---

## ✅ Diagnostic Steps

### Step 1: Check Item in ERPNext

1. Open item 10886 in ERPNext
2. Verify:
   - ✅ `custom_dcs` = `MENFOTSLP` (required for sync)
   - ✅ `item_name` = `VEGA SLIP RUB SOLE 07-1` (the new name)
   - ✅ `modified` timestamp is recent

### Step 2: Check Database

Run this SQL:
```sql
SELECT code, name, updated_at 
FROM tabItem 
WHERE code = '10886';
```

**Expected:**
- If item exists: Shows current name (might be old)
- If item doesn't exist: No rows returned

### Step 3: Run Full Sync with Logging

1. **Rebuild application** (to get the new logging for item 10886)
2. **Click "Sync Items"**
3. **Choose "No" (Full Sync)** - This ensures ALL items are synced
4. **Check logs** for: `ItemSyncService: Processing item 10886`

**If you see:**
- ✅ `Processing item 10886` → Item was fetched, check update logic
- ❌ No mention of 10886 → Item wasn't fetched (filter or paging issue)

---

## 🔧 Quick Fixes

### Fix 1: Verify Filter Value

**In ERPNext, check item 10886:**
- Field: `custom_dcs`
- Value: Should be `MENFOTSLP`

**If different:**
- Update item in ERPNext to set `custom_dcs = MENFOTSLP`
- OR change filter in code (not recommended)

### Fix 2: Force Full Sync

1. **Clear LastItemSyncTimestamp:**
   - Open `wms_settings.json`
   - Set `"LastItemSyncTimestamp": null`
   - Save and restart app
   - Run sync (will do full sync)

### Fix 3: Manual Database Update (Temporary)

If you need immediate fix:
```sql
UPDATE tabItem 
SET name = 'VEGA SLIP RUB SOLE 07-1',
    updated_at = CURRENT_TIMESTAMP
WHERE code = '10886';
```

Then refresh Items view.

---

## 🧪 Test After Fix

1. **Verify item in ERPNext** has `custom_dcs = MENFOTSLP`
2. **Run Full Sync**
3. **Check logs** for: `ItemSyncService: Processing item 10886 - Name: 'VEGA SLIP RUB SOLE 07-1'`
4. **Check logs** for: `ItemSyncService: Updated existing item: 10886 - VEGA SLIP RUB SOLE 07-1`
5. **Verify database:**
   ```sql
   SELECT code, name FROM tabItem WHERE code = '10886';
   ```
   Should show: `VEGA SLIP RUB SOLE 07-1`

---

## ✅ Summary

**Most Likely Cause:** Item 10886 doesn't have `custom_dcs = MENFOTSLP`, so it's filtered out during sync.

**Solution:**
1. Check item 10886 in ERPNext has `custom_dcs = MENFOTSLP`
2. If not, update it in ERPNext
3. Run Full Sync
4. Check logs to verify item 10886 was processed
5. Verify database shows new name

**The sync code is correct** - it will update items if they exist. The issue is that item 10886 is not being fetched from ERPNext (likely due to filter mismatch).
