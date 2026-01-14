# Stock Posting System - Complete Implementation Guide

## 🎯 Goal

Make stock updates **immediate and consistent everywhere**:

- ✅ Stock Ledger is source-of-truth
- ✅ Item stock summary (`tabItem.stock_qty`) = SUM(ledger)
- ✅ Bin stock summary = SUM(ledger) grouped by bin
- ✅ All updates happen automatically after transactions

## 📋 Implementation Status

### ✅ Completed

1. **Stock Posting Log Table** (`tabStockPostingLog`)

   - Ensures idempotency
   - Prevents duplicate stock updates
   - Location: `SCRIPTS/CreateStockPostingLog.sql`

2. **Centralized Stock Posting Service** (`stockPostingService.js`)

   - `postStock(transactionType, transactionId, options)` function
   - Rebuilds item stock summary from ledger
   - Rebuilds bin stock summary from ledger
   - Key normalization (bin_location, item_code, warehouse)
   - Idempotency checking
   - Location: `wms-api/src/modules/stock-ledger/stockPostingService.js`

3. **Diagnostics Endpoint**

   - `GET /api/wms/stock/diagnose?item_code=XXX&warehouse=YYY`
   - Returns ledger total, item stock total, bin stock totals
   - Identifies mismatches and duplicates
   - Location: `wms-api/src/modules/stock-ledger/stockDiagnosticsController.js`

4. **Integration Points**
   - ✅ Material Request Picking (`pickMaterialRequestItems`)
   - ✅ Transfer Carton Dispatch (`dispatchTransferCarton`)
   - ✅ Putaway Completion (`processPutawayCompletionEvent`)

### 🔄 In Progress

5. **Additional Transaction Endpoints** (Need Integration)
   - ⏳ Receiving/ASN completion
   - ⏳ Cycle Count submission
   - ⏳ Transfer In
   - ⏳ Stock Adjustments

## 🚀 Setup Instructions

### Step 1: Create Stock Posting Log Table

Run the SQL script:

```bash
mysql -u erppadmin -pP61nt! wms_desktop < SCRIPTS/CreateStockPostingLog.sql
```

Or execute in MySQL Workbench:

```sql
-- See SCRIPTS/CreateStockPostingLog.sql
```

### Step 2: Verify Integration

The stock posting service is already integrated into:

- Material Request picking
- Transfer Carton dispatch
- Putaway completion

**No additional setup needed** - it runs automatically!

### Step 3: Test Diagnostics Endpoint

```bash
GET http://localhost:3000/api/wms/stock/diagnose?item_code=SKU-HAT-301-BLU-OS&warehouse=WH-MAIN
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**

```json
{
  "ok": true,
  "data": {
    "item_code": "SKU-HAT-301-BLU-OS",
    "warehouse": "WH-MAIN",
    "ledger_total": 96.0,
    "item_stock_total": 96.0,
    "bin_stock_total": 96.0,
    "bin_breakdown": [{ "bin_location": "A1-R01-L3-B1", "qty": 96.0 }],
    "matches": {
      "ledger_vs_item": "match",
      "ledger_vs_bin": "match"
    },
    "discrepancies": {
      "item_difference": 0.0,
      "bin_difference": 0.0
    },
    "duplicates": []
  }
}
```

## 🔧 How It Works

### 1. Stock Posting Flow

```
Transaction Endpoint (e.g., pick-items)
    ↓
Updates tabStockLedger (source of truth)
    ↓
Calls postStock('MR_PICK', mr_id, { itemCodes, warehouse })
    ↓
Checks idempotency (tabStockPostingLog)
    ↓
Rebuilds item stock summary (tabItem.stock_qty)
    ↓
Rebuilds bin stock summary (ensures no duplicates)
    ↓
Logs posting (tabStockPostingLog)
    ↓
✅ Stock consistent everywhere!
```

### 2. Idempotency

**Posting Key Format:** `TRANSACTION_TYPE:TRANSACTION_ID`

Examples:

- `MR_PICK:MR-123457`
- `TC_DISPATCH:TC-MR-123457-1234567890`
- `PUTAWAY:PUTAWAY-001`

**If already posted:**

- Returns `{ posted: false, reason: 'already_posted' }`
- Skips rebuilding (prevents duplicate work)

### 3. Key Normalization

All keys are normalized for consistency:

- **bin_location:** Trim, uppercase, remove duplicate spaces
- **item_code:** Trim, uppercase
- **warehouse:** Trim, uppercase

Example:

- Input: `"  a1-r01-l3-b1  "` → Output: `"A1-R01-L3-B1"`
- Input: `"sku-hat-301-blu-os"` → Output: `"SKU-HAT-301-BLU-OS"`

### 4. Rebuilding Summaries

**Item Stock Summary:**

```sql
UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
)
WHERE code = ?
```

**Bin Stock Summary:**

- Ensures one record per (item_code, warehouse, bin_location)
- Removes duplicates by using `INSERT ... ON DUPLICATE KEY UPDATE`
- Groups by bin to show correct totals

## 📊 Transaction Types

Current transaction types supported:

- `MR_PICK` - Material Request picking
- `TC_DISPATCH` - Transfer Carton dispatch
- `PUTAWAY` - Putaway completion

**To add more:**

1. Import `postStock` in your controller
2. Call `postStock()` after updating `tabStockLedger`
3. Pass affected `itemCodes` and `warehouse`

## 🧪 Testing

### Test 1: Material Request Picking

1. Pick items for a Material Request
2. Check diagnostics:
   ```bash
   GET /api/wms/stock/diagnose?item_code=SKU-HAT-301-BLU-OS&warehouse=WH-MAIN
   ```
3. Verify all totals match

### Test 2: Transfer Carton Dispatch

1. Dispatch a Transfer Carton
2. Check diagnostics for all items in the carton
3. Verify stock reduced correctly

### Test 3: Putaway

1. Complete a Putaway task
2. Check diagnostics for all items
3. Verify stock increased correctly

## 🔍 Troubleshooting

### Issue: Stock Still Mismatched

**Solution:**

1. Run diagnostics endpoint to identify discrepancies
2. Check for duplicates in `tabStockLedger`
3. Manually trigger stock posting:
   ```javascript
   // In API console or script
   const {
     postStock,
   } = require("./modules/stock-ledger/stockPostingService.js");
   await postStock("MANUAL_SYNC", "SYNC-001", {
     itemCodes: ["SKU-HAT-301-BLU-OS"],
     warehouse: "WH-MAIN",
   });
   ```

### Issue: Duplicate Postings

**Check posting log:**

```sql
SELECT * FROM tabStockPostingLog
WHERE transaction_type = 'MR_PICK'
ORDER BY posted_at DESC
LIMIT 10;
```

If duplicates exist, the idempotency check should prevent them.

### Issue: Normalization Problems

**Check for inconsistent keys:**

```sql
SELECT DISTINCT bin_location
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY bin_location;
```

Should see normalized values (uppercase, trimmed).

## 📝 Next Steps

### To Complete Implementation:

1. **Integrate into Receiving:**

   - Find receiving completion endpoint
   - Add `postStock('RECEIVE', asn_no, { itemCodes, warehouse })`

2. **Integrate into Cycle Count:**

   - Find cycle count submission endpoint
   - Add `postStock('CYCLE_COUNT', task_id, { itemCodes, warehouse })`

3. **Integrate into Transfer In:**

   - Find transfer in completion endpoint
   - Add `postStock('TRANSFER_IN', doc_id, { itemCodes, warehouse })`

4. **Add Alerts:**
   - Log warnings when mismatches detected
   - Send notifications for large discrepancies

## ✅ Acceptance Criteria

- ✅ Ledger shows 96 → Item stock shows 96 → Bin stock sum = 96
- ✅ Immediately after MR submit, stock deducted in item and bin
- ✅ Mobile only calls transaction endpoints (no "update stock" API)
- ✅ All updates are atomic (single transaction)
- ✅ Idempotent (can be called multiple times safely)

## 📚 API Reference

### Stock Posting Service

```javascript
import { postStock } from "../stock-ledger/stockPostingService.js";

const result = await postStock("MR_PICK", "MR-123457", {
  itemCodes: ["SKU-001", "SKU-002"],
  warehouse: "WH-MAIN",
  postedBy: "USER-001",
  connection: existingConnection, // Optional: use existing transaction
});

// Result:
// {
//   posted: true,
//   postingKey: 'MR_PICK:MR-123457',
//   affectedItems: ['SKU-001', 'SKU-002'],
//   binLocationsCount: 5
// }
```

### Diagnostics Endpoint

```bash
GET /api/wms/stock/diagnose?item_code=SKU-001&warehouse=WH-MAIN
Authorization: Bearer TOKEN
```

## 🎉 Benefits

1. **Consistency:** Stock always matches between views
2. **Performance:** Only rebuilds affected items
3. **Reliability:** Idempotent (safe to retry)
4. **Auditability:** Posting log tracks all updates
5. **Maintainability:** Single source of truth (ledger)
