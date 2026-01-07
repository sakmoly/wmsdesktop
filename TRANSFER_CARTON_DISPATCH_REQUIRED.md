# Transfer Carton Dispatch Required

## Issue: Stock Not Deducted

The transfer carton **TC-MR-123456-1767539596500** is **Sealed** but **NOT Dispatched** yet.

**Stock reduction only occurs when a transfer carton is Dispatched, not when it's Sealed.**

## Current Status

- ✅ **Status:** Sealed
- ❌ **Dispatched:** Not dispatched
- ⚠️ **Stock:** Not reduced yet (expected behavior)

## Solution: Dispatch the Transfer Carton

To reduce stock, you must dispatch the transfer carton first.

### Option 1: Via API (Manual)

Use the API endpoint to dispatch:

**POST** `/api/transfer-cartons/dispatch`

**Request Body:**
```json
{
  "tc_id": "TC-MR-123456-1767539596500",
  "dispatched_by": "USER-150526"
}
```

**cURL Command:**
```bash
curl -X POST http://localhost:3000/api/transfer-cartons/dispatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tc_id":"TC-MR-123456-1767539596500","dispatched_by":"USER-150526"}'
```

### Option 2: Add Dispatch Button to Desktop App (Recommended)

Currently, the desktop app does NOT have a dispatch button. You should:

1. Add a "Dispatch" button to the Transfer Carton Detail window
2. The button should only be enabled when status is "Sealed"
3. On click, call the API endpoint `POST /api/transfer-cartons/dispatch`
4. After successful dispatch, refresh the transfer carton details

## Workflow

1. **Pick Items** → Items are picked from locations
2. **Pack to Transfer Carton** → Items are packed into transfer carton
3. **Seal Transfer Carton** → Transfer carton is sealed (no more items can be added)
4. **Dispatch Transfer Carton** → ⭐ **STOCK IS REDUCED HERE** ⭐
5. **Completed** → Transfer carton is ready for shipment

## Why Stock is Not Reduced on Seal?

Per your explicit requirement:
> "i prefer after Sealed CTN need another status dispatch, once change to dispatch create Stock ledger and reduce the stock"

Stock reduction happens on **Dispatch**, not on **Seal**. This allows you to:
- Seal cartons (mark as complete)
- Review sealed cartons before final dispatch
- Reduce stock only when actually dispatching (leaving warehouse)

## Next Steps

1. **Test Dispatch via API** to verify stock reduction works
2. **Add Dispatch Button** to desktop app for better UX
3. **Verify Stock Ledger** after dispatch to confirm stock was reduced

