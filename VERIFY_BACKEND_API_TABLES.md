# Backend API Table Verification Guide

## Purpose

Verify that the backend API uses `tabSortBox` (not `tabBox`) before deleting the `tabBox` table.

---

## Step 1: Locate Backend API Code

The backend API code should be in one of these locations:

1. **Separate Repository:** Check your backend API repository
2. **Server Location:** Check where the API is deployed
3. **Local Development:** Check your local backend API folder

### Expected File Locations

Look for these files in your backend API:

```
wms-api/
├── src/
│   ├── modules/
│   │   ├── boxes/              ← Look for this folder
│   │   │   ├── boxController.js
│   │   │   └── boxRoutes.js
│   │   └── ...
│   └── routes/
│       └── index.js            ← Check route definitions
```

---

## Step 2: Search for Table References

### Search Commands

**If backend API is in a separate repository/folder:**

```bash
# Search for tabBox references
grep -r "tabBox" wms-api/src/

# Search for tabSortBox references
grep -r "tabSortBox" wms-api/src/

# Search for box-related SQL queries
grep -r "INSERT INTO.*box" wms-api/src/
grep -r "SELECT.*FROM.*box" wms-api/src/
grep -r "UPDATE.*box" wms-api/src/
```

**If using Windows PowerShell:**

```powershell
# Search for tabBox
Select-String -Path "wms-api\src\**\*.js" -Pattern "tabBox"

# Search for tabSortBox
Select-String -Path "wms-api\src\**\*.js" -Pattern "tabSortBox"

# Search for box table queries
Select-String -Path "wms-api\src\**\*.js" -Pattern "INSERT INTO.*box|SELECT.*FROM.*box|UPDATE.*box"
```

---

## Step 3: Check Specific Endpoints

### Endpoints to Verify

Check these API endpoints for table name usage:

1. **POST /api/boxes/create**
   - Should use: `INSERT INTO tabSortBox`
   - Should NOT use: `INSERT INTO tabBox`

2. **GET /api/boxes**
   - Should use: `SELECT ... FROM tabSortBox`
   - Should NOT use: `SELECT ... FROM tabBox`

3. **GET /api/boxes/{box_id}**
   - Should use: `SELECT ... FROM tabSortBox WHERE box_id = ?`
   - Should NOT use: `SELECT ... FROM tabBox WHERE box_id = ?`

4. **POST /api/boxes/close**
   - Should use: `UPDATE tabSortBox SET status = 'Closed' ...`
   - Should NOT use: `UPDATE tabBox SET status = 'Closed' ...`

5. **POST /api/boxes/reopen**
   - Should use: `UPDATE tabSortBox SET status = 'Open' ...`
   - Should NOT use: `UPDATE tabBox SET status = 'Open' ...`

---

## Step 4: Code Patterns to Look For

### ✅ Correct Pattern (tabSortBox)

```javascript
// ✅ CORRECT - Using tabSortBox
const query = `
  INSERT INTO tabSortBox 
  (box_id, status, advance_shipping_notice, transfer_order, store, purpose, created_by, created_on)
  VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
`;

// ✅ CORRECT - Using tabSortBox
const query = `
  SELECT * FROM tabSortBox 
  WHERE asn_no = ? AND store = ? AND status = ?
`;

// ✅ CORRECT - Using tabSortBox
const query = `
  UPDATE tabSortBox 
  SET status = ?, closed_by = ?, closed_on = NOW()
  WHERE box_id = ?
`;
```

### ❌ Incorrect Pattern (tabBox)

```javascript
// ❌ WRONG - Using tabBox (needs to be changed)
const query = `
  INSERT INTO tabBox 
  (box_id, status, advance_shipping_notice, transfer_order, store, purpose, created_by, created_on)
  VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
`;

// ❌ WRONG - Using tabBox (needs to be changed)
const query = `
  SELECT * FROM tabBox 
  WHERE asn_no = ? AND store = ? AND status = ?
`;
```

---

## Step 5: Verification Checklist

Use this checklist to verify before deleting `tabBox`:

- [ ] **Backend API Code Found**
  - [ ] Located backend API repository/folder
  - [ ] Found box-related controller files
  - [ ] Found box-related route files

- [ ] **Table Name Verification**
  - [ ] Searched for `tabBox` references → Found: ___ instances
  - [ ] Searched for `tabSortBox` references → Found: ___ instances
  - [ ] All box endpoints use `tabSortBox` (not `tabBox`)

- [ ] **Specific Endpoints Checked**
  - [ ] POST /api/boxes/create uses `tabSortBox` ✅
  - [ ] GET /api/boxes uses `tabSortBox` ✅
  - [ ] GET /api/boxes/{box_id} uses `tabSortBox` ✅
  - [ ] POST /api/boxes/close uses `tabSortBox` ✅
  - [ ] POST /api/boxes/reopen uses `tabSortBox` ✅

- [ ] **If tabBox Found in Code**
  - [ ] Created list of files that need updating
  - [ ] Updated all references from `tabBox` to `tabSortBox`
  - [ ] Tested updated endpoints
  - [ ] Verified database operations work correctly

---

## Step 6: Fix Backend API (If Needed)

If you find `tabBox` references in the backend API, update them:

### Find and Replace Pattern

**Find:**
```javascript
tabBox
```

**Replace:**
```javascript
tabSortBox
```

### Files That May Need Updates

1. `wms-api/src/modules/boxes/boxController.js`
2. `wms-api/src/modules/boxes/boxRoutes.js`
3. Any SQL query files
4. Any database migration scripts

---

## Step 7: Test After Updates

After updating backend API code:

1. **Restart Backend API Server**
2. **Test Box Creation:**
   ```bash
   POST /api/boxes/create
   ```
3. **Test Box Retrieval:**
   ```bash
   GET /api/boxes?asn=ASN-0001&store=STORE-001&status=Open
   ```
4. **Verify Database:**
   - Check that records are created in `tabSortBox`
   - Verify no errors in API logs

---

## Step 8: Safe to Delete tabBox

Once all checks pass:

✅ **Safe to delete `tabBox` if:**
- Backend API uses `tabSortBox` (verified)
- Desktop App uses `tabSortBox` (already verified)
- No data in `tabBox` OR data migrated to `tabSortBox`
- No foreign key relationships

Then proceed with `SAFE_DELETE_TABBOX.sql`

---

## Quick Verification Script

If you have access to the backend API code, run this script:

```bash
#!/bin/bash
# verify_backend_tables.sh

echo "Searching for tabBox references..."
grep -r "tabBox" wms-api/src/ | grep -v "node_modules" | grep -v ".git"

echo ""
echo "Searching for tabSortBox references..."
grep -r "tabSortBox" wms-api/src/ | grep -v "node_modules" | grep -v ".git"

echo ""
echo "Checking box-related SQL queries..."
grep -r "INSERT INTO.*box\|SELECT.*FROM.*box\|UPDATE.*box" wms-api/src/ | grep -v "node_modules" | grep -v ".git"
```

---

**Last Updated:** 2024-12-25  
**Status:** Verification Guide Ready

