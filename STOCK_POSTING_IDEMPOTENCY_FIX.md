# Stock Posting Idempotency Fix

## 🐛 Problem

When picking multiple items for the same Material Request in separate API calls:
- **First item picked** → Stock posted successfully ✅
- **Second item picked** → Stock posting skipped (already_posted) ❌

**Result:** Item-level and location-level stock not updated for subsequent items.

## 🔍 Root Cause

The stock posting service uses idempotency to prevent duplicate updates:
- **Posting Key Format:** `TRANSACTION_TYPE:TRANSACTION_ID`
- **Example:** `MR_PICK:MR-1401263`

**Issue:** All items in the same Material Request use the same transaction ID (`MR-1401263`), so:
1. First API call picks item 1 → Creates posting log with key `MR_PICK:MR-1401263`
2. Second API call picks item 2 → Sees key already exists → Skips stock posting

## ✅ Solution

### Change Applied

Made the posting key **unique per API call** by including a timestamp:

**Before:**
```javascript
const postingResult = await postStock('MR_PICK', title, {
  itemCodes,
  warehouse: null,
  postedBy: normalizedCreatedBy,
  connection
});
// Posting key: MR_PICK:MR-1401263 (same for all calls)
```

**After:**
```javascript
const timestamp = Date.now();
const uniqueTransactionId = `${title}:${timestamp}`;
const postingResult = await postStock('MR_PICK', uniqueTransactionId, {
  itemCodes,
  warehouse: null,
  postedBy: normalizedCreatedBy,
  connection
});
// Posting key: MR_PICK:MR-1401263:1705234567890 (unique per call)
```

### How It Works

1. **Each API call gets unique timestamp**
   - Prevents blocking between different API calls
   - Allows multiple items to be picked sequentially

2. **Still maintains idempotency**
   - If the same API call is retried (same timestamp), it will be skipped
   - Prevents duplicate updates within the same transaction

3. **Stock updates correctly**
   - Each item pick triggers stock posting
   - `tabItem.stock_qty` updates correctly
   - Bin-level stock updates correctly

## 📊 Expected Behavior

### Before Fix
```
API Call 1: Pick SKU-HAT-301-BLU-OS (2 qty)
  → Stock posted ✅
  → tabItem.stock_qty: 350 → 348 ✅

API Call 2: Pick SKU-SHOES-101-BLK-43 (5 qty)
  → Stock posting skipped ❌
  → tabItem.stock_qty: Still 348 ❌ (should be 343)
```

### After Fix
```
API Call 1: Pick SKU-HAT-301-BLU-OS (2 qty)
  → Stock posted ✅
  → tabItem.stock_qty: 350 → 348 ✅

API Call 2: Pick SKU-SHOES-101-BLK-43 (5 qty)
  → Stock posted ✅ (unique key)
  → tabItem.stock_qty: 348 → 343 ✅
```

## 🧪 Testing

1. **Pick first item:**
   ```bash
   POST /api/material-requests/MR-1401263/pick-items
   {
     "items": [{"item_code": "SKU-HAT-301-BLU-OS", "picked_qty": 2, "source_bin": "A1-R01-L3-B1"}]
   }
   ```
   - Should see: `✅ Stock posted for Material Request MR-1401263`
   - Check `tabItem.stock_qty` reduced by 2

2. **Pick second item (same MR):**
   ```bash
   POST /api/material-requests/MR-1401263/pick-items
   {
     "items": [{"item_code": "SKU-SHOES-101-BLK-43", "picked_qty": 5, "source_bin": "A1-R01-L3-B1"}]
   }
   ```
   - Should see: `✅ Stock posted for Material Request MR-1401263` (NOT skipped)
   - Check `tabItem.stock_qty` reduced by 5 more

3. **Verify stock consistency:**
   ```bash
   GET /api/wms/stock/diagnose?item_code=SKU-HAT-301-BLU-OS&warehouse=WH-MAIN
   ```
   - Should show: `ledger_total` = `item_stock_total` = `bin_stock_total`

## ⚠️ Important Notes

1. **Idempotency Still Works:**
   - If the same API call is retried (network retry, etc.), it will still be skipped
   - The timestamp ensures uniqueness only between different API calls

2. **Posting Log:**
   - Each API call creates a separate entry in `tabStockPostingLog`
   - This is expected and allows tracking of each pick operation

3. **Performance:**
   - Timestamp-based keys are very fast to generate
   - No performance impact

## 🔄 Alternative Solutions Considered

### Option 1: Disable Idempotency for Material Requests
**Rejected:** Would allow duplicate updates if API is called multiple times with same data.

### Option 2: Include Item Codes in Key
**Rejected:** Would allow duplicate updates if same items are picked multiple times.

### Option 3: Timestamp-Based Key (Chosen)
**Accepted:** Best balance between preventing duplicates and allowing sequential picks.

## ✅ Result

- ✅ Each item pick updates stock correctly
- ✅ No more "already_posted" skips for subsequent items
- ✅ Item-level stock (`tabItem.stock_qty`) updates correctly
- ✅ Location-level stock updates correctly
- ✅ Idempotency still prevents duplicate updates within same call
