# Migration 005 Required

## Error: Table 'tabCartonStock' doesn't exist

This error occurs when you try to use **Carton Level Inventory** mode, but Migration 005 hasn't been run yet.

## Solution

### Step 1: Run Migration 005

1. Open the desktop application
2. Go to **Settings**
3. Click **"Run Migration 005"** button
4. Confirm the dialog
5. Wait for completion

### Step 2: Verify Migration

After running the migration, you should see:
- ✅ `tabBin` table created
- ✅ `tabCarton` table created
- ✅ `tabCartonItem` table created
- ✅ `tabCartonStock` table created
- ✅ `carton_id` column added to `tabStockTransaction`

### Step 3: Test Again

1. Go to **Items** menu
2. Select an item
3. Click **"Show Location Breakdown"**
4. It should work now (or show "No carton data" if no cartons exist)

## What the Error Means

The system is trying to query `tabCartonStock` table, but it doesn't exist because:
- Migration 005 hasn't been run yet, OR
- Migration 005 failed to create the tables

## Automatic Fallback

The system will automatically:
- ✅ Detect that carton tables don't exist
- ✅ Show a helpful message
- ✅ Fall back to bin-level inventory mode
- ✅ Continue working normally

## Verification

To verify tables exist, run this SQL:

```sql
SHOW TABLES LIKE 'tabCarton%';
SHOW TABLES LIKE 'tabBin';
```

You should see:
- `tabBin`
- `tabCarton`
- `tabCartonItem`
- `tabCartonStock`

---

**Status:** ✅ Error handling improved - system will show helpful message and fall back gracefully

