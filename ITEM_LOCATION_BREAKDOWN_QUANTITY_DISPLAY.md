# Item Location Breakdown - Quantity Display Explanation

## How Quantities Are Displayed

### Display Format: **Flat Format (One Row Per Carton)**

The Item Location Breakdown shows **one row per carton** at each bin location. Each row displays:

- **Location ID**: Bin location (e.g., `A1-R01-L3-B1`)
- **Carton ID**: Carton identifier (e.g., `CTN-001`)
- **Available Qty**: **This is the quantity displayed in the screen** ✅

---

## Quantity Calculation Flow

### Step 1: Get Current Stock from `tabStockLedger`

**Source of Truth:** `tabStockLedger.qty` (current stock at bin location)

```sql
SELECT qty, reserved_qty
FROM tabStockLedger
WHERE item_code = ? AND warehouse = ? AND bin_location = ?
```

**Result:** 
- `total_qty` = Current stock at bin (from `tabStockLedger.qty`)
- `reserved_qty` = Reserved quantity at bin

---

### Step 2: Get Carton Quantities from `tabTransactionHistory`

**Calculate net quantity per carton** (putaway - picking):

```sql
SELECT 
  carton_id,
  SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE 0 END) as putaway_qty,
  SUM(CASE WHEN transaction_type = 'Picking' THEN ABS(qty_change) ELSE 0 END) as picked_qty,
  SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE -ABS(qty_change) END) as net_qty
FROM tabTransactionHistory
WHERE item_code = ? AND warehouse = ? AND bin_location = ?
  AND carton_id IS NOT NULL
GROUP BY carton_id
HAVING net_qty > 0
```

**Result:**
- Each carton has a `net_qty` (putaway - picking)
- Only cartons with `net_qty > 0` are shown

---

### Step 3: Scale Carton Quantities to Match Current Stock

**Problem:** Transaction History might show different total than current stock (due to adjustments, cycle counts, etc.)

**Solution:** Scale carton quantities proportionally to match current stock:

```javascript
// Calculate total from Transaction History
const historyTotalQty = sum of all carton net_qty;

// Get current stock from Stock Ledger (source of truth)
const ledgerTotalQty = tabStockLedger.qty;

// Scale each carton proportionally
if (historyTotalQty !== ledgerTotalQty) {
  cartonQty = (cartonNetQty / historyTotalQty) * ledgerTotalQty;
} else {
  cartonQty = cartonNetQty; // Use directly if totals match
}

// Round to whole number (no decimals)
cartonQty = Math.round(cartonQty);
```

**Example:**
- Transaction History: Carton A = 10, Carton B = 5 (Total = 15)
- Current Stock (Ledger): 12
- Scaled: Carton A = 8, Carton B = 4 (Total = 12) ✅

---

### Step 4: Calculate Available Quantity Per Carton

**For each carton row:**

```javascript
// Carton's share of reserved qty (proportional)
const cartonReservedQty = (cartonQty / binTotalQty) * binReservedQty;

// Carton's share of blocked qty (proportional)
const cartonBlockedQty = (cartonQty / binTotalQty) * binBlockedQty;

// Available qty for THIS carton
const cartonAvailableQty = cartonQty - cartonReservedQty - cartonBlockedQty;

// Round to whole number
cartonAvailableQty = Math.round(cartonAvailableQty);
```

**Example:**
- Carton Qty: 10
- Bin Reserved Qty: 3 (for total bin qty of 20)
- Carton's Share of Reserved: (10/20) * 3 = 1.5 → 2 (rounded)
- Carton's Share of Blocked: 0
- **Carton Available Qty: 10 - 2 - 0 = 8** ✅

---

## What Gets Displayed in the Screen

### For Each Row (One Carton):

| Field | Value | Source |
|-------|-------|--------|
| **Location ID** | `A1-R01-L3-B1` | From `tabLocation` |
| **Carton ID** | `CTN-001` | From `tabTransactionHistory` |
| **Available Qty** | **8** | **This is what you see** ✅ |
| Total Qty | 20 | Total at bin (sum of all cartons) |
| Reserved Qty | 2 | Carton's share of reserved |
| Blocked Qty | 0 | Carton's share of blocked |

**Note:** The **Available Qty** column is what's displayed in the Item Location Breakdown screen.

---

## After Relocation - What Changes

### Before Relocation:
```
Location: A1-R01-L3-B1
  Carton CTN-001: Available Qty = 10 ✅
```

### After Relocating CTN-001 to A1-R01-L4-B1:
```
Location: A1-R01-L3-B1
  (No cartons - carton moved) ✅

Location: A1-R01-L4-B1
  Carton CTN-001: Available Qty = 10 ✅
```

**What Happens:**
1. ✅ `tabStockLedger` updated: Old bin qty decreases, new bin qty increases
2. ✅ `tabCartonStock.bin_location` updated to new bin
3. ✅ `tabTransactionHistory` has new relocation transaction
4. ✅ Item Location Breakdown shows carton at new bin location
5. ✅ Available Qty remains the same (10) - stock is moved, not changed

---

## Quantity Fields Explained

### `total_qty` (Total Quantity)
- **Meaning:** Total physical stock at the bin location
- **Source:** `tabStockLedger.qty` (source of truth)
- **Calculation:** Sum of all carton quantities at the bin
- **Display:** Shown in API response, but not the main displayed quantity

### `available_qty` (Available Quantity) ⭐ **THIS IS WHAT YOU SEE**
- **Meaning:** Available quantity for THIS carton (after reserved and blocked)
- **Calculation:** `cartonQty - cartonReservedQty - cartonBlockedQty`
- **Display:** **This is the quantity shown in the Item Location Breakdown screen** ✅
- **Rounded:** Always rounded to whole number (no decimals)

### `reserved_qty` (Reserved Quantity)
- **Meaning:** Carton's share of reserved quantity at the bin
- **Calculation:** `(cartonQty / binTotalQty) * binReservedQty`
- **Display:** Shown in API response, used for calculation

### `blocked_qty` (Blocked Quantity)
- **Meaning:** Carton's share of blocked quantity (HOLD, STAGING, DAMAGED, etc.)
- **Calculation:** `(cartonQty / binTotalQty) * binBlockedQty`
- **Display:** Shown in API response, used for calculation

---

## Example: Complete Calculation

### Scenario:
- Item: `SKU-001`
- Bin: `A1-R01-L3-B1`
- Current Stock (Ledger): 20
- Reserved Qty: 3
- Blocked Qty: 0
- Cartons: CTN-001 (12 qty), CTN-002 (8 qty)

### Calculation:

**Carton CTN-001:**
- Carton Qty: 12
- Carton Reserved: (12/20) * 3 = 1.8 → 2 (rounded)
- Carton Blocked: 0
- **Carton Available: 12 - 2 - 0 = 10** ✅

**Carton CTN-002:**
- Carton Qty: 8
- Carton Reserved: (8/20) * 3 = 1.2 → 1 (rounded)
- Carton Blocked: 0
- **Carton Available: 8 - 1 - 0 = 7** ✅

### Display in Item Location Breakdown:

| Location | Carton | Available Qty |
|----------|--------|---------------|
| A1-R01-L3-B1 | CTN-001 | **10** ✅ |
| A1-R01-L3-B1 | CTN-002 | **7** ✅ |
| **Total** | | **17** ✅ |

**Note:** Total Available (17) = Total Stock (20) - Reserved (3) - Blocked (0) ✅

---

## Summary

### What You See in Item Location Breakdown:

✅ **One row per carton** at each bin location  
✅ **Available Qty** column shows: `cartonQty - cartonReservedQty - cartonBlockedQty`  
✅ Quantities are **rounded to whole numbers** (no decimals)  
✅ Quantities are **scaled to match current stock** (from `tabStockLedger`)  
✅ After relocation, carton appears at **new bin location** with **same available qty**  

### Key Points:

1. **Source of Truth:** `tabStockLedger.qty` (current stock at bin)
2. **Carton Quantities:** Calculated from `tabTransactionHistory` (net_qty = putaway - picking)
3. **Scaling:** Carton quantities scaled proportionally to match current stock
4. **Available Qty:** Carton qty minus carton's share of reserved/blocked
5. **Display:** Available Qty is what you see in the screen ✅

**Result:** The quantity displayed in Item Location Breakdown accurately reflects the available stock for each carton at each bin location! ✅
