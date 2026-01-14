# Stock Ledger Qty +/- Fix

## Issue

**Problem:** Qty +/- was showing 100.00 instead of the actual transaction quantity (e.g., 2.00)

**Root Cause:** The code was using `absoluteQty` (absolute value) instead of `pickedQty` (actual transaction quantity)

---

## Fix Applied

### Before (Incorrect):
```javascript
const absoluteQty = Math.abs(pickedQty); // e.g., 2 → 2
const qtyReduced = isDecreasing ? absoluteQty : -absoluteQty; // -2 or +2
```

**Problem:** If mobile app sends `picked_qty: 100` (total picked), this would show -100, but the actual transaction might be only 2 items.

### After (Correct):
```javascript
const qtyReduced = isDecreasing ? pickedQty : -pickedQty; // Use actual transaction qty
// pickedQty is the actual transaction quantity (e.g., 2 items)
```

**Result:** Qty +/- now shows the actual transaction quantity:
- If user picks 2 items → Qty +/- = -2.00
- If user picks 5 items → Qty +/- = -5.00
- If user decreases by 3 items → Qty +/- = +3.00

---

## Expected Behavior

### Example: User picks 2 items

**Request:**
```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "picked_qty": 2,  // ← Transaction quantity (2 items in this scan)
      "source_bin": "A1-R01-L3-B1"
    }
  ]
}
```

**Stock Ledger Display:**
- **Qty:** 2.00 (Transaction Qty)
- **Available Qty:** 98.00 (Stock after deduction)
- **Qty Before:** 100.00 (Stock before deduction)
- **Qty +/-:** -2.00 (Current transaction qty, negative for picking)

---

## Important Note

**Mobile App Must Send:**
- `picked_qty` = **Transaction quantity** (items picked in this specific scan/transaction)
- NOT the total picked quantity

**Example:**
- User scans 2 items → Send `picked_qty: 2`
- User scans 3 more items → Send `picked_qty: 3` (not 5)
- Backend will increment: `picked_qty = current + 2`, then `picked_qty = current + 3`

---

## Testing

After the fix:
1. Pick 2 items → Qty +/- should show -2.00
2. Pick 5 items → Qty +/- should show -5.00
3. Decrease by 3 items → Qty +/- should show +3.00

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13
