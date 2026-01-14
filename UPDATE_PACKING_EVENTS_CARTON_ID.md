# Update Packing Events Carton ID

## Issue

Transfer carton contents are showing items with empty "Source Carton" (carton_id), even though stock was already deducted from a specific carton ID during dispatch. These packing events need to be updated with the same carton_id that was used for stock deduction.

## Solution

Created a script (`wms-api/update-packing-events-carton-id.js`) that:

1. **Finds packing events without carton_id** for transfer cartons
2. **Looks up carton_id from stock transactions** (dispatch/picking records) that match the item and transfer carton
3. **Updates packing events** with the carton_id found in stock transactions

## How It Works

### Step 1: Find Packing Events Without Carton ID

The script finds all `PACK_BOX_TO_TC` and `PACK_ITEM_TO_TC` events where:
- `carton_id IS NULL` or empty
- `item_code IS NOT NULL`
- `tc_id IS NOT NULL`

### Step 2: Find Carton ID from Stock Transactions

For each packing event without carton_id, the script:

1. **Checks `tabStockTransaction`**:
   - Matches by `item_code`, `reference_doc` (tc_id or transfer_order), and `transaction_type` ('Dispatch', 'Picking')
   - Retrieves `carton_id` from the stock transaction
   - Optionally matches by `bin_location` if available

2. **Fallback: Check `tabCartonStock`**:
   - If carton_id not found in stock transactions, tries to find carton_id from `tabCartonStock`
   - Matches by `item_code` and `bin_location` (if available)
   - Finds carton with `qty > 0` and `status = 'PUTAWAY'`

3. **Last Resort: Find Any Carton for Item**:
   - If no bin location available, finds any carton in `tabCartonStock` for the item
   - Used as a last resort when other methods fail

### Step 3: Update Packing Events

Once a carton_id is found, the script:
- Updates the packing event's `carton_id` field
- Logs the update for verification

## Usage

### Run the Script

```bash
cd wms-api
npm run update-packing-carton-id
```

### Output

The script will:
1. Show all packing events without carton_id
2. Attempt to find carton_id for each event
3. Update events with found carton_id
4. Display a summary of updates

## Example Output

```
🔧 Update Packing Events Carton ID Tool
========================================

📊 Step 1: Finding packing events without carton_id...

⚠️  Found 2 packing event(s) without carton_id:

┌─────────────────────────────────────────────┬──────────────────┬──────┐
│ tc_id                                       │ item_code        │ qty  │
├─────────────────────────────────────────────┼──────────────────┼──────┤
│ TC-MR-0001-1768152754168                    │ SKU-HAT-301-BLU  │ 1    │
│ TC-MR-0001-1768152754168                    │ SKU-HAT-301-BLU  │ 3    │
└─────────────────────────────────────────────┴──────────────────┴──────┘

📊 Step 2: Finding carton_id from stock transactions...

✅ Updated event xxx-xxx-xxx: Item SKU-HAT-301-BLU-OS → Carton CTN-A1-R01-L3-B1-20260111-162835-760

📋 Summary
============================================================
Total events without carton_id: 2
✅ Updated: 2
⚠️  Not found: 0

✅ Script completed!
```

## Next Steps

After running the script:

1. **Restart Desktop App**: Refresh the desktop application to see updated carton IDs in Transfer Carton Details
2. **Verify Data**: Check that all items now show "Source Carton" values
3. **Check Stock Transactions**: Verify that carton_ids match between packing events and stock transactions

## Notes

- The script only updates events where `carton_id` is empty or NULL
- It prioritizes carton_id from stock transactions (dispatch/picking records)
- Falls back to `tabCartonStock` if stock transactions don't have carton_id
- Updates are performed directly in the database
- The script is safe to run multiple times (idempotent)
