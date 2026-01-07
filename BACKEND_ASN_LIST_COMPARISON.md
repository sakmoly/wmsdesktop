# Backend ASN List API - Comparison & Fix

## 🔍 Issue

The mobile app shows a different ASN list than the desktop app. The mobile app calls `GET /api/master/asns`, while the desktop app queries directly from the database.

## 📊 Desktop App Query

**File:** `Services/AsnDataService.cs`

```sql
SELECT 
  a.title, 
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
```

## 🔧 Backend API Implementation

**File:** `wms-api/src/modules/master/masterController.js`

The backend API endpoint `GET /api/master/asns` should match the desktop app query exactly.

### Key Requirements:

1. ✅ **Same Table**: `tabAdvanceShippingNotice`
2. ✅ **Same JOIN**: `LEFT JOIN tabAsnItemDetails` with `carton_id IS NOT NULL`
3. ✅ **Same GROUP BY**: All ASN fields
4. ✅ **Same ORDER BY**: `shipment_date DESC, title`
5. ✅ **Same Carton Count**: `COUNT(DISTINCT d.carton_id)`

## 📝 Implementation Steps

### Step 1: Update Backend Controller

Replace or update the `getAllAsns` function in `wms-api/src/modules/master/masterController.js` with the code from `BACKEND_ASN_LIST_API_IMPLEMENTATION.js`.

### Step 2: Verify Route Registration

Ensure the route is registered in `wms-api/src/routes/index.js`:

```javascript
import { getAllAsns } from '../modules/master/masterController.js';

// ... existing code ...

router.get('/api/master/asns', authenticateToken, getAllAsns);
```

### Step 3: Restart Backend Server

Restart your Node.js backend server to apply the changes.

## 🧪 Testing

### Test Backend API:

```bash
curl -X GET http://localhost:3000/api/master/asns \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Expected Response:

```json
[
  {
    "title": "ASN-00005",
    "status": "Submitted",
    "purchase_order": "PO-2024-005",
    "supplier": "Supplier JKL",
    "shipment_date": "2024-12-15",
    "expected_arrival_date": "2024-12-20",
    "total_shipped_qty": 300.00,
    "airway_bill_no": null,
    "shipment_type": "Air",
    "updated_on": "2024-12-24T16:14:05Z",
    "total_carton_count": 4
  },
  {
    "title": "ASN-00001",
    "status": "Submitted",
    "purchase_order": "PO-2024-001",
    "supplier": "Supplier ABC",
    "shipment_date": "2024-12-20",
    "expected_arrival_date": "2024-12-25",
    "total_shipped_qty": 150.00,
    "airway_bill_no": null,
    "shipment_type": "Road",
    "updated_on": "2024-12-24T16:14:04Z",
    "total_carton_count": 2
  }
]
```

### Verify Both Match:

1. **Desktop App**: Check ASN list in desktop application
2. **Mobile App**: Check ASN list in mobile application
3. **Compare**: Both should show the same ASNs in the same order

## 🔍 Common Differences to Check

### 1. **Different Tables**
- ❌ Backend might be querying `tabASN` instead of `tabAdvanceShippingNotice`
- ✅ **Fix**: Use `tabAdvanceShippingNotice`

### 2. **Different JOIN Conditions**
- ❌ Backend might not filter `carton_id IS NOT NULL`
- ✅ **Fix**: Add `AND d.carton_id IS NOT NULL` to JOIN

### 3. **Different Sorting**
- ❌ Backend might order by `title` only or different field
- ✅ **Fix**: Use `ORDER BY a.shipment_date DESC, a.title`

### 4. **Different Carton Count**
- ❌ Backend might count all items instead of distinct cartons
- ✅ **Fix**: Use `COUNT(DISTINCT d.carton_id)`

### 5. **Status Filtering**
- ❌ Backend might filter by status (e.g., only "Submitted")
- ✅ **Fix**: Remove status filters, return all ASNs

### 6. **ASN Format Normalization** ⚠️ CRITICAL
- ❌ Backend might normalize ASN to 5-digit format
- ❌ Backend might use `normalizeAsnNumber()` function
- ❌ Backend might format ASN with `LPAD()` or `CONCAT()`
- ✅ **Fix**: Return ASN in original format from database (NO normalization)
- ✅ **Fix**: Use `a.title` directly from database (no transformation)
- ✅ **Fix**: Return field as `asn_no` (not `title`) to match mobile app expectations

## ✅ Summary

The backend API endpoint `GET /api/master/asns` should:
- ✅ Query the same table (`tabAdvanceShippingNotice`)
- ✅ Use the same JOIN condition (`LEFT JOIN tabAsnItemDetails` with `carton_id IS NOT NULL`)
- ✅ Use the same GROUP BY clause
- ✅ Use the same ORDER BY clause (`shipment_date DESC, title`)
- ✅ Return the same fields in the same format
- ✅ Not filter by status (return all ASNs)
- ✅ **CRITICAL**: Not normalize ASN format (return as stored in database)
- ✅ **CRITICAL**: Use `a.title` directly from database (no `LPAD()`, `CONCAT()`, or normalization functions)
- ✅ **CRITICAL**: Return field as `asn_no` (not `title`) to match mobile app expectations
- ✅ **CRITICAL**: Preserve original format exactly (3, 4, 5, 10 digits, etc.)

After updating the backend API, both mobile and desktop apps should show the same ASN list.

