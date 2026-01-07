# Backend ASN Format Preservation - Implementation Guide

## ✅ Summary

The backend API **MUST preserve ASN formats exactly as they come from the database**, without any normalization. The mobile app expects the original format (e.g., `ASN-00001`, `ASN-00002`, `ASN-00005`).

## 🚨 Critical Requirements

### DO NOT:
- ❌ Normalize ASN numbers (e.g., `ASN-00001` → `ASN-0001`)
- ❌ Format ASN numbers (e.g., padding to fixed length)
- ❌ Use `normalizeAsnNumber()` function
- ❌ Use `LPAD()` or `CONCAT()` to format ASN
- ❌ Transform ASN numbers in any way

### DO:
- ✅ Return ASN numbers exactly as stored in database
- ✅ Preserve original format (3, 4, 5, 10 digits, etc.)
- ✅ Use ASN format directly from database in queries
- ✅ Return field as `asn_no` (not `title`) for mobile app compatibility

## 📋 Implementation

### File: `wms-api/src/modules/master/masterController.js`

```javascript
// GET /api/master/asns
export const getAllAsns = asyncHandler(async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    // ✅ CORRECT: Use a.title directly - NO normalization
    const query = `
      SELECT 
        a.title,  -- ✅ Original format from database (preserve exactly)
        a.status,
        a.purchase_order,
        a.supplier,
        a.shipment_date,
        a.expected_arrival_date,
        a.total_shipped_qty,
        a.airway_bill_no,
        a.shipment_type,
        a.updated_on,
        COALESCE(COUNT(DISTINCT d.carton_id), 0) as total_carton_count
      FROM tabAdvanceShippingNotice a
      LEFT JOIN tabAsnItemDetails d 
        ON a.title = d.parent_title 
        AND d.carton_id IS NOT NULL
      GROUP BY 
        a.title, 
        a.status, 
        a.purchase_order, 
        a.supplier, 
        a.shipment_date, 
        a.expected_arrival_date, 
        a.total_shipped_qty, 
        a.airway_bill_no, 
        a.shipment_type, 
        a.updated_on
      ORDER BY a.shipment_date DESC, a.title
    `;

    const [rows] = await connection.query(query);

    // ✅ CORRECT: Return asn_no field with original format (no transformation)
    const asns = rows.map(row => ({
      asn_no: row.title,  // ✅ Preserve original format exactly
      status: row.status,
      purchase_order: row.purchase_order,
      supplier: row.supplier,
      shipment_date: row.shipment_date ? row.shipment_date.toISOString().split('T')[0] : null,
      expected_arrival_date: row.expected_arrival_date ? row.expected_arrival_date.toISOString().split('T')[0] : null,
      total_shipped_qty: parseFloat(row.total_shipped_qty) || 0,
      airway_bill_no: row.airway_bill_no || null,
      shipment_type: row.shipment_type || null,
      updated_on: row.updated_on ? row.updated_on.toISOString() : null,
      total_carton_count: parseInt(row.total_carton_count) || 0
    }));

    res.json(asns);
    
  } catch (error) {
    logger.error({ error }, 'Failed to fetch ASN list');
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch ASN list'
    });
  } finally {
    connection.release();
  }
});
```

## ❌ Common Mistakes to Avoid

### Mistake 1: Normalizing in SQL Query

```sql
-- ❌ WRONG: Normalizing ASN format
SELECT 
  CONCAT('ASN-', LPAD(SUBSTRING_INDEX(a.title, '-', -1), 5, '0')) as asn_no,
  ...
FROM tabAdvanceShippingNotice a

-- ✅ CORRECT: Use original format
SELECT 
  a.title as asn_no,  -- Preserve exactly as stored
  ...
FROM tabAdvanceShippingNotice a
```

### Mistake 2: Using Normalization Function

```javascript
// ❌ WRONG: Normalizing ASN after query
import { normalizeAsnNumber } from '../../utils/normalize.js';

const asns = rows.map(row => ({
  asn_no: normalizeAsnNumber(row.title),  // ❌ Don't normalize!
  ...
}));

// ✅ CORRECT: Use original format
const asns = rows.map(row => ({
  asn_no: row.title,  // ✅ Preserve exactly
  ...
}));
```

### Mistake 3: Formatting with LPAD

```sql
-- ❌ WRONG: Padding ASN to fixed length
SELECT 
  CONCAT('ASN-', LPAD(SUBSTRING_INDEX(a.title, '-', -1), 5, '0')) as asn_no,
  ...
FROM tabAdvanceShippingNotice a

-- ✅ CORRECT: Use original format
SELECT 
  a.title as asn_no,  -- Preserve exactly
  ...
FROM tabAdvanceShippingNotice a
```

## 🧪 Testing

### 1. Check Database Format

```sql
-- Check actual ASN format in database
SELECT title FROM tabAdvanceShippingNotice LIMIT 5;
```

**Expected:** `ASN-00001`, `ASN-00002`, `ASN-00005`, etc. (exact format as stored)

### 2. Test API Response

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
[
  {
    "asn_no": "ASN-00001",  // ✅ Must match database format exactly
    "status": "Submitted",
    "purchase_order": "PO-2024-001",
    "supplier": "Supplier ABC",
    "total_carton_count": 2,
    ...
  },
  {
    "asn_no": "ASN-00002",  // ✅ Must match database format exactly
    "status": "Submitted",
    ...
  }
]
```

### 3. Verify Format Preservation

- ✅ API returns `asn_no` in same format as database
- ✅ No normalization applied (e.g., `ASN-00001` stays `ASN-00001`)
- ✅ Mobile app shows same format as desktop
- ✅ All ASNs preserve their original digit count

## 📊 Expected Result

After implementation:
- ✅ Mobile app shows ASNs in same format as desktop
- ✅ ASN format preserved exactly (e.g., `ASN-00001`, `ASN-00002`, `ASN-00005`)
- ✅ No normalization or formatting applied
- ✅ Mobile and desktop ASN lists match exactly
- ✅ Field name is `asn_no` (not `title`) for mobile app compatibility

## 🔍 Verification Checklist

- [ ] SQL query uses `a.title` directly (no `LPAD()`, `CONCAT()`, or normalization)
- [ ] No `normalizeAsnNumber()` function called
- [ ] Response field is `asn_no` (not `title`)
- [ ] ASN format matches database exactly
- [ ] Mobile app shows same format as desktop
- [ ] All ASNs preserve original digit count

## 📝 Notes

- **Database Column**: `tabAdvanceShippingNotice.title` stores ASN
- **API Field**: Return as `asn_no` for mobile app compatibility
- **Format**: Preserve exactly as stored (no transformation)
- **Mobile App**: Expects `asn_no` field with original format

---

**Priority:** High  
**Impact:** Mobile and desktop ASN lists must match exactly  
**Status:** ✅ Implementation provided in `BACKEND_ASN_LIST_API_IMPLEMENTATION.js`

