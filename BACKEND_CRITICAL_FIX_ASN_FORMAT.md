# Backend Critical Fix - ASN Format Normalization Issue

## 🚨 Critical Issue

**Backend API is returning 5-digit format:** `"ASN-00004"`  
**Database stores 4-digit format:** `"ASN-0004"`  
**Desktop shows 4-digit format:** `"ASN-0004"`  

**The backend is normalizing ASN numbers when it shouldn't!**

## ✅ What Needs to Be Fixed

The backend must return ASN numbers **exactly as stored in the database** (4-digit format), without any normalization.

## 🔧 Immediate Action Required

### 1. Find Actual Backend Server Location

The files in this workspace (`wms-api/src/`) are correct, but your **actual backend server** is running from a different location and using different code.

**Find where your backend server is actually running from:**
- Check backend startup command
- Check backend logs
- Check process manager (pm2, systemd, etc.)

### 2. Check Actual Backend Code

In your **actual backend server directory**, open:
```
src/modules/master/masterController.js
```

**Find the line that sets `asn_no` (around line 84):**

**✅ CORRECT (should be):**
```javascript
asn_no: row.title,  // Returns original format from database
```

**❌ WRONG (if you see this):**
```javascript
asn_no: normalizeAsnNumber(row.title),  // ❌ Remove this!
// or
asn_no: formatAsnTo5Digit(row.title),  // ❌ Remove this!
// or any other normalization function
```

### 3. Fix the Code

**Change from:**
```javascript
const asns = rows.map(row => ({
  asn_no: normalizeAsnNumber(row.title),  // ❌ WRONG
  // ... other fields
}));
```

**To:**
```javascript
const asns = rows.map(row => ({
  asn_no: row.title,  // ✅ CORRECT - Returns original format
  // ... other fields
}));
```

### 4. Search for All Normalization

In your actual backend directory, search for:
```bash
grep -r "normalizeAsnNumber" src/
grep -r "LPAD.*ASN\|CONCAT.*ASN" src/
grep -r "formatAsn\|padAsn" src/
```

**Remove or comment out ALL normalization code.**

### 5. Restart Backend Server

```bash
# Stop server
# Then restart
npm start
# or
pm2 restart wms-api
```

### 6. Test Again

Test in Postman:
```
GET http://localhost:3000/api/master/asns
Authorization: Bearer {token}
```

**Expected:** `"asn_no": "ASN-0004"` (4-digit) ✅

## 📋 Code Reference

**Correct implementation (from workspace):**

```javascript
// wms-api/src/modules/master/masterController.js
export const getAllAsns = asyncHandler(async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const query = `
      SELECT 
        a.title,  -- ✅ Use original format (no normalization)
        a.status,
        // ... other fields
      FROM tabAdvanceShippingNotice a
      // ... rest of query
    `;

    const [rows] = await connection.query(query);

    const asns = rows.map(row => ({
      asn_no: row.title,  // ✅ Return original format (no normalization)
      status: row.status,
      // ... other fields
    }));

    res.json(asns);
  } finally {
    connection.release();
  }
});
```

## 🎯 Summary

1. **Find actual backend location** (not workspace files)
2. **Check actual backend code** for normalization
3. **Remove normalization** - use `row.title` directly
4. **Restart backend server**
5. **Test API** - should return 4-digit format

---

**Status:** 🔴 **CRITICAL - Backend normalizing when it shouldn't**  
**Action:** Update actual backend code to remove normalization

