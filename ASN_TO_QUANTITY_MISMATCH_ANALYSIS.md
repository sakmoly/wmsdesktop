# ASN-0001 vs TO-0001 Quantity Mismatch Analysis

## 🔍 Issue Identified

**Critical Data Inconsistency Found:**

### ASN-0001 Status:
- ✅ ASN Header exists in `tabAdvanceShippingNotice`
- ✅ Total Shipped Qty: **150.00**
- ❌ **NO items found in `tabAsnItemDetails` table**

### TO-0001 Status:
- ✅ TO Header exists in `tabTransferOrder`
- ✅ Linked to ASN-0001 (`advance_shipping_notice = 'ASN-0001'`)
- ✅ Total Allocated Qty: **600.00**
- ✅ **5 items found in `tabTransferOrderItem` table**

### TO-0001 Items Breakdown:

| Store | Item Code | Allocated Qty | Total per Item |
|-------|-----------|---------------|----------------|
| STORE-001 | SKU-TSHIRT-001-BLK-M | 100.00 | |
| STORE-001 | SKU-TSHIRT-001-BLK-S | 100.00 | |
| STORE-002 | SKU-TSHIRT-001-BLK-M | 150.00 | |
| STORE-002 | SKU-TSHIRT-001-BLK-S | 150.00 | |
| STORE-003 | SKU-JEANS-021-BLU-32 | 100.00 | |
| **TOTAL** | | | **600.00** |

### Item Totals in TO-0001:
- SKU-TSHIRT-001-BLK-M: **250.00** (100 + 150)
- SKU-TSHIRT-001-BLK-S: **250.00** (100 + 150)
- SKU-JEANS-021-BLU-32: **100.00**

---

## ⚠️ Problems Identified

1. **ASN-0001 has NO item details** - `tabAsnItemDetails` table is empty for ASN-0001
2. **Quantity Mismatch:**
   - ASN-0001 Header shows: **150.00** total shipped qty
   - TO-0001 shows: **600.00** total allocated qty
   - Difference: **450.00** (TO has 4x more than ASN header indicates)

3. **Item Code Mismatch:**
   - TO-0001 has items: `SKU-TSHIRT-001-BLK-M`, `SKU-TSHIRT-001-BLK-S`, `SKU-JEANS-021-BLU-32`
   - ASN-0001 has NO items to compare

---

## 🔧 Recommended Solutions

### Option 1: Add Missing ASN Item Details

If ASN-0001 should have items matching TO-0001, insert the missing data:

```sql
-- Insert ASN Item Details to match TO-0001 items
INSERT INTO tabAsnItemDetails 
    (parent_title, item_code, po_item_reference, shipped_qty, carton_id, carton_assigned_status)
VALUES
    -- Based on TO-0001 allocations
    ('ASN-0001', 'SKU-TSHIRT-001-BLK-M', 'PO-ITEM-001', 250.00, 'CTN-0101', 'Assigned'),
    ('ASN-0001', 'SKU-TSHIRT-001-BLK-S', 'PO-ITEM-002', 250.00, 'CTN-0101', 'Assigned'),
    ('ASN-0001', 'SKU-JEANS-021-BLU-32', 'PO-ITEM-003', 100.00, 'CTN-0102', 'Assigned');

-- Update ASN header total_shipped_qty to match
UPDATE tabAdvanceShippingNotice 
SET total_shipped_qty = 600.00 
WHERE title = 'ASN-0001';
```

### Option 2: Fix TO-0001 to Match ASN-0001

If ASN-0001 header (150.00) is correct, then TO-0001 quantities need to be reduced:

```sql
-- This would require knowing the correct allocation per item
-- Based on ASN header total of 150.00, TO allocations need to be adjusted
```

### Option 3: Verify Source Data

Check the original source (ERPNext or import data) to determine:
- What items should be in ASN-0001?
- What is the correct total quantity for ASN-0001?
- Should TO-0001 match ASN-0001 exactly or can it allocate differently?

---

## 📋 Next Steps

1. **Determine Correct Source of Truth:**
   - Check ERPNext or original import data
   - Verify what ASN-0001 should contain

2. **Fix Data Inconsistency:**
   - Either add missing ASN item details
   - Or adjust TO-0001 quantities to match ASN-0001

3. **Validation:**
   - Run comparison script again after fixes
   - Ensure quantities match or are within acceptable tolerance

---

## 🔍 Verification Query

After fixing, run this query to verify:

```sql
-- Compare ASN and TO totals
SELECT 
    'ASN-0001' AS source,
    COALESCE(SUM(shipped_qty), 0) AS total_qty
FROM tabAsnItemDetails
WHERE parent_title = 'ASN-0001'

UNION ALL

SELECT 
    'TO-0001' AS source,
    COALESCE(SUM(allocated_qty), 0) AS total_qty
FROM tabTransferOrderItem
WHERE parent_title = 'TO-0001';
```

---

**Generated:** 2025-12-27  
**Comparison Script:** `wms-api/compare-asn-to.js`

