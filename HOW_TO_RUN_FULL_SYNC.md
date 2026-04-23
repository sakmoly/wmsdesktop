# How to Run Full Sync

## 📋 Step-by-Step Instructions

### Step 1: Open Items View

1. **Launch the desktop application**
2. **Navigate to the "Items" view/screen**
   - This is where you see the list of items

### Step 2: Click "Sync Items" Button

1. **Find the "Sync Items" button** (usually at the top of the Items view)
2. **Click the "Sync Items" button**

### Step 3: Choose Sync Type

A **MessageBox dialog** will appear asking:

```
Do you want to sync only changed items?

Yes = Incremental Sync (only changed items)
No = Full Sync (all items)
```

**To run Full Sync:**
- ✅ **Click "No"** (Full Sync - all items)

**Options:**
- **Yes** = Incremental Sync (only items modified since last sync)
- **No** = Full Sync (all items matching the filter)
- **Cancel** = Cancel the sync operation

### Step 4: Wait for Sync to Complete

1. **Status message** will appear: "Syncing all items..."
2. **Wait for the sync to complete** (may take a few minutes depending on number of items)
3. **A summary message** will appear showing:
   - Number of items inserted
   - Number of items updated
   - Number of errors (if any)

### Step 5: Verify Results

1. **Check the Items view** - you should now see all synced items
2. **For your filter** (`{"item_name":"COLN WMN WST"}`), you should see **230 items**

---

## 🎯 Visual Guide

```
┌─────────────────────────────────────┐
│  Items View                         │
│                                     │
│  [Test Sync] [Sync Items] [Show Loc]│
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Code | Name | Item Group | ... │ │
│  │ ...  | ...  | ...        | ... │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
         ↓ Click "Sync Items"
         
┌─────────────────────────────────────┐
│  Sync Items?                        │
│                                     │
│  Do you want to sync only changed  │
│  items?                             │
│                                     │
│  Yes = Incremental Sync             │
│  No = Full Sync                     │
│                                     │
│  [Yes]  [No]  [Cancel]             │
└─────────────────────────────────────┘
         ↓ Click "No"
         
┌─────────────────────────────────────┐
│  Status: "Syncing all items..."     │
│                                     │
│  (Wait for completion...)           │
└─────────────────────────────────────┘
         ↓ Sync Complete
         
┌─────────────────────────────────────┐
│  Sync Complete                      │
│                                     │
│  Inserted: 230                      │
│  Updated: 0                         │
│  Errors: 0                          │
│                                     │
│  [OK]                               │
└─────────────────────────────────────┘
```

---

## ⚠️ Important Notes

### Full Sync vs Incremental Sync

**Full Sync (Click "No"):**
- ✅ Syncs **ALL items** matching your filter
- ✅ Ignores modification date
- ✅ Use when:
  - First time syncing with a new filter
  - Items haven't been modified recently
  - You want to ensure all items are synced

**Incremental Sync (Click "Yes"):**
- ⚠️ Only syncs items **modified after last sync date**
- ⚠️ Faster (fewer items to process)
- ⚠️ Use when:
  - You've already done a full sync
  - You only want recently changed items

### For Your Current Situation

Since you're using filter `{"item_name":"COLN WMN WST"}` and Postman returns 230 items, but incremental sync returned 0 items:

**You MUST use Full Sync** to get all 230 items!

---

## 🔍 Troubleshooting

### Issue: No "Sync Items" button visible

**Solution:**
- Make sure you're on the Items view/screen
- Check if the button is disabled (grayed out) - this might mean sync is already running

### Issue: Sync takes too long

**Solution:**
- This is normal for full sync with many items
- Wait for the status message to show completion
- Check the summary message for results

### Issue: Still getting 0 items after Full Sync

**Solution:**
1. Check the logs: `bin/Debug/net8.0-windows/ErrorLogs/error_YYYY-MM-DD.log`
2. Look for: `ErpNextItemApiService: Using filters: {"item_name":"COLN WMN WST"}`
3. Verify the filter is correct in `wms_settings.json`
4. Test the same filter in Postman to confirm it works

---

## ✅ Summary

**To run Full Sync:**

1. Open Items view
2. Click "Sync Items" button
3. **Click "No"** when prompted
4. Wait for sync to complete
5. Verify items in the Items view

**For your filter:** Full Sync will sync all 230 "COLN WMN WST" items! 🎉
