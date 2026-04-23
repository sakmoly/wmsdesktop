# Debug Item Update Issue

## 🔍 Problem
Item name changed in ERPNext, but sync doesn't update it in local database.

## ✅ Fix Applied

### Issue 1: MySQL VALUES() Function Compatibility
**Changed from:**
```sql
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    ...
```

**To:**
```sql
ON DUPLICATE KEY UPDATE
    name = @name,
    ...
```

**Why:** Some MySQL versions or configurations may have issues with `VALUES()` function. Using explicit parameter names is more reliable.

### Issue 2: Whitespace Handling
**Added trimming** to item code and name to avoid:
- Leading/trailing spaces causing mismatches
- Case sensitivity issues
- Encoding problems

### Issue 3: Enhanced Logging
**Added detailed logging** to track:
- When items are inserted vs updated
- Item code and name being processed
- Unexpected row counts

---

## 🧪 Testing Steps

### Step 1: Check Current Item in Database

Run this SQL query to see current item:
```sql
SELECT code, name, item_group, brand, updated_at 
FROM tabItem 
WHERE code = 'YOUR_ITEM_CODE';
```

### Step 2: Change Item Name in ERPNext

1. Open the item in ERPNext
2. Change the `item_name` field
3. Save the item
4. Note the `modified` timestamp

### Step 3: Run Sync

1. Open Items view in WMS Desktop
2. Click "Sync Items"
3. Choose "Full Sync" (to ensure it picks up the change)
4. Check the success message

### Step 4: Verify Update

**Check the logs:**
- Look for: `ItemSyncService: Updated existing item: YOUR_ITEM_CODE - NEW_NAME`
- Should show "Updated: 1" in success message

**Check the database:**
```sql
SELECT code, name, updated_at 
FROM tabItem 
WHERE code = 'YOUR_ITEM_CODE';
```
- `name` should be the new name
- `updated_at` should be recent

---

## 🔍 Troubleshooting

### Issue: Still Not Updating

**Check 1: Item Code Match**
```sql
-- Check if item code in database matches ERPNext exactly
SELECT code, name FROM tabItem WHERE code LIKE '%YOUR_CODE%';
```
- Verify no extra spaces
- Verify case matches (if case-sensitive)
- Verify encoding is correct

**Check 2: Sync Logs**
- Check `ErrorLogs/error_YYYY-MM-DD.log`
- Look for: `ItemSyncService: Updated existing item: ...`
- If you see "Inserted" instead of "Updated", the item code doesn't match

**Check 3: Database Primary Key**
```sql
-- Verify primary key exists
SHOW CREATE TABLE tabItem;
```
- Should show: `code VARCHAR(100) PRIMARY KEY`

**Check 4: Manual Test**
```sql
-- Test UPSERT manually
INSERT INTO tabItem (code, name, item_group, brand, stock_uom, maintain_stock, updated_at)
VALUES ('TEST-001', 'Old Name', 'Group', 'Brand', 'PCS', TRUE, NOW())
ON DUPLICATE KEY UPDATE
    name = 'New Name',
    updated_at = NOW();

-- Check result
SELECT code, name FROM tabItem WHERE code = 'TEST-001';
-- Should show: 'New Name'
```

---

## 📝 Expected Behavior

**After fix:**
1. ✅ Item code is trimmed (no whitespace issues)
2. ✅ UPDATE uses explicit parameters (better compatibility)
3. ✅ Logs show "Updated existing item" when item exists
4. ✅ Success message shows "Updated: X" count
5. ✅ Database `name` field is updated with new value
6. ✅ `updated_at` timestamp is refreshed

---

## ✅ Summary

**Fixed:**
- ✅ Changed `VALUES(name)` to `@name` for better MySQL compatibility
- ✅ Added trimming to item code and name
- ✅ Enhanced logging to track updates vs inserts

**Next Steps:**
1. Rebuild the application
2. Test sync with a changed item name
3. Check logs to verify "Updated existing item" message
4. Verify database shows the new name
