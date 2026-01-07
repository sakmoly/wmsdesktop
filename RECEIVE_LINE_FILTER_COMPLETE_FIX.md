# Receive Line Filter - Complete Fix ✅

## ✅ Changes Made

### 1. **Database Query Level Filtering** ✅
**File:** `Services/InboundSessionDataService.cs`

**Change:** Modified the receive lines SQL query to use `INNER JOIN` with unload lines:

```sql
SELECT DISTINCT r.parent_title, r.carton_id, r.item_code, r.expected_qty, 
       r.received_qty, r.`condition`, r.remarks
FROM tabInboundReceiveLine r
INNER JOIN tabInboundUnloadLine u 
    ON r.parent_title = u.parent_title 
    AND r.carton_id = u.unit_id 
    AND u.unit_type = 'Carton'
WHERE r.parent_title IN (...)
```

**Result:** Only receive lines for unloaded cartons are fetched from the database.

---

### 2. **Sync Service Filtering** ✅
**File:** `Services/InboundSessionSyncService.cs`

**Change:** Added filtering when syncing receive lines from the API:

```csharp
// Get unloaded carton IDs from API response or database
// Filter receive lines to only include those for unloaded cartons
var filteredReceiveLines = apiSession.ReceiveLines
    .Where(r => unloadedCartonIds.Contains(r.CartonId))
    .ToList();
```

**Result:** Only filtered receive lines are inserted into the database during sync.

---

### 3. **ViewModel Level Filtering** ✅
**File:** `ViewModels/InboundSessionDetailViewModel.cs`

**Change:** Added filtering in the ViewModel constructor (with logging):

```csharp
// Get set of unloaded carton IDs
var unloadedCartonIds = new HashSet<string>(
    session.UnloadLines
        .Where(u => u.UnitType == "Carton")
        .Select(u => u.UnitId),
    StringComparer.OrdinalIgnoreCase
);

// Filter receive lines
var filteredReceiveLines = session.ReceiveLines
    .Where(r => unloadedCartonIds.Contains(r.CartonId))
    .Select(InboundReceiveLineEditable.FromInboundReceiveLine)
    .ToList();
```

**Result:** Additional safety layer to ensure only unloaded cartons' receive lines are displayed.

---

## 🔧 Important: Clean Up Existing Data

**If you still see unfiltered receive lines, you may need to clean up existing data in the database:**

The database might have old receive lines for cartons that haven't been unloaded yet. You can clean them up with this SQL:

```sql
-- Delete receive lines for cartons that haven't been unloaded
DELETE r FROM tabInboundReceiveLine r
LEFT JOIN tabInboundUnloadLine u 
    ON r.parent_title = u.parent_title 
    AND r.carton_id = u.unit_id 
    AND u.unit_type = 'Carton'
WHERE u.unit_id IS NULL;
```

**Or, delete all receive lines and let the sync repopulate them (recommended):**

```sql
-- Delete all receive lines (they will be repopulated from API with filtering)
DELETE FROM tabInboundReceiveLine;
```

---

## 📋 Testing Steps

1. **Close the application** (if running)

2. **Clean up existing unfiltered data** (optional, if needed):
   ```sql
   DELETE r FROM tabInboundReceiveLine r
   LEFT JOIN tabInboundUnloadLine u 
       ON r.parent_title = u.parent_title 
       AND r.carton_id = u.unit_id 
       AND u.unit_type = 'Carton'
   WHERE u.unit_id IS NULL;
   ```

3. **Rebuild the application**:
   ```bash
   dotnet build
   ```

4. **Run the application** and test:
   - Open Inbound Sessions
   - Double-click a session to open details
   - **Verify:** Receive Lines should only show items for cartons that appear in Unload Lines

5. **Check logs** for filtering information:
   - Look for: `"InboundSessionDetailViewModel: Found X unloaded cartons"`
   - Look for: `"InboundSessionDetailViewModel: Total receive lines before filtering: X"`
   - Look for: `"InboundSessionDetailViewModel: Total receive lines after filtering: X"`

---

## 🎯 Expected Behavior

**Example:**
- **Unload Lines:** CTN-0101, CTN-0102, CTN-0103
- **Receive Lines (Should Show):** Only items for CTN-0101, CTN-0102, CTN-0103
- **Receive Lines (Should NOT Show):** Items for CTN-0104, CTN-0105, etc. (if they exist in database)

---

## ⚠️ Troubleshooting

### If filtering still doesn't work:

1. **Check database directly:**
   ```sql
   -- Check unload lines
   SELECT * FROM tabInboundUnloadLine WHERE parent_title = 'SESSION-XXX';
   
   -- Check receive lines (should only show unloaded cartons)
   SELECT * FROM tabInboundReceiveLine WHERE parent_title = 'SESSION-XXX';
   ```

2. **Check if data is coming from API sync:**
   - If API returns unfiltered receive lines, they will be filtered during sync
   - Check sync logs for filtering information

3. **Verify the SQL JOIN is working:**
   ```sql
   -- This query should only return receive lines for unloaded cartons
   SELECT DISTINCT r.carton_id, r.item_code
   FROM tabInboundReceiveLine r
   INNER JOIN tabInboundUnloadLine u 
       ON r.parent_title = u.parent_title 
       AND r.carton_id = u.unit_id 
       AND u.unit_type = 'Carton'
   WHERE r.parent_title = 'SESSION-XXX';
   ```

4. **Check application logs** for filtering messages

---

**Status:** ✅ **Fix Complete - Three Layers of Filtering Implemented**

