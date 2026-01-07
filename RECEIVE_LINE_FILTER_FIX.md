# Receive Line Filter Fix - Complete ✅

## 🐛 Problem Identified

**Issue:** Receive lines were showing items for **all cartons** in the session, not just the cartons that have been **unloaded**.

**Expected Behavior:** Receive lines should only display items for cartons that have been unloaded (i.e., cartons that appear in the Unload Lines section).

**Example:**
- **Unload Lines:** CTN-0101, CTN-0102, CTN-0103 (3 cartons unloaded)
- **Receive Lines Before Fix:** Showed items for ALL cartons in ASN (including CTN-0104, CTN-0105, etc.)
- **Receive Lines After Fix:** Only shows items for CTN-0101, CTN-0102, CTN-0103 ✅

---

## ✅ Solution Implemented

### 1. **Filter Receive Lines in ViewModel** ✅

**File:** `ViewModels/InboundSessionDetailViewModel.cs`

**Change:** Added filtering logic to only show receive lines for cartons that have been unloaded.

**Code Logic:**
```csharp
// Get set of unloaded carton IDs (unit_id from unload lines where unit_type is "Carton")
var unloadedCartonIds = new HashSet<string>(
    session.UnloadLines
        .Where(u => u.UnitType == "Carton")
        .Select(u => u.UnitId),
    StringComparer.OrdinalIgnoreCase
);

// Only include receive lines where carton_id matches an unloaded carton
var filteredReceiveLines = session.ReceiveLines
    .Where(r => unloadedCartonIds.Contains(r.CartonId))
    .Select(InboundReceiveLineEditable.FromInboundReceiveLine)
    .ToList();

ReceiveLines = new ObservableCollection<InboundReceiveLineEditable>(filteredReceiveLines);
```

**How It Works:**
1. Creates a `HashSet` of all unloaded carton IDs from `UnloadLines` (where `UnitType == "Carton"`)
2. Filters `ReceiveLines` to only include those where `CartonId` matches an unloaded carton ID
3. Uses case-insensitive comparison (`StringComparer.OrdinalIgnoreCase`) to handle any case differences

---

### 2. **Updated AddReceiveLine Method** ✅

**File:** `ViewModels/InboundSessionDetailViewModel.cs`

**Change:** Updated `AddReceiveLine` command to only allow adding receive lines for unloaded cartons.

**Code Logic:**
```csharp
// Get unloaded carton IDs (only cartons that have been unloaded can have receive lines)
var unloadedCartonIds = UnloadLines
    .Where(u => u.UnitType == "Carton")
    .Select(u => u.UnitId)
    .Distinct()
    .ToList();

if (!unloadedCartonIds.Any())
{
    MessageBox.Show("No cartons have been unloaded yet. Please unload cartons first.", ...);
    return;
}

// Get available cartons from ASN that have been unloaded
var availableCartons = Asn?.Details
    .Where(d => !string.IsNullOrEmpty(d.CartonId) && unloadedCartonIds.Contains(d.CartonId!))
    .Select(d => d.CartonId!)
    .Distinct()
    .ToList() ?? new List<string>();
```

**How It Works:**
1. Gets list of unloaded carton IDs from `UnloadLines`
2. Shows error message if no cartons have been unloaded
3. Filters ASN cartons to only include those that have been unloaded
4. Only allows adding receive lines for unloaded cartons

---

## 📊 Before vs After

### Before Fix ❌
```
Unload Lines:
- CTN-0101 (Carton)
- CTN-0102 (Carton)
- CTN-0103 (Carton)

Receive Lines (showing ALL cartons):
- CTN-0101, SKU-001, 50, 50 ✅
- CTN-0102, SKU-002, 30, 30 ✅
- CTN-0103, SKU-003, 40, 40 ✅
- CTN-0104, SKU-004, 60, 60 ❌ (not unloaded yet)
- CTN-0105, SKU-005, 70, 70 ❌ (not unloaded yet)
```

### After Fix ✅
```
Unload Lines:
- CTN-0101 (Carton)
- CTN-0102 (Carton)
- CTN-0103 (Carton)

Receive Lines (only showing unloaded cartons):
- CTN-0101, SKU-001, 50, 50 ✅
- CTN-0102, SKU-002, 30, 30 ✅
- CTN-0103, SKU-003, 40, 40 ✅
```

---

## ✅ Benefits

1. **Correct Business Logic:** Receive lines only show items for cartons that have been unloaded
2. **Better User Experience:** Users can't accidentally add receive lines for cartons that haven't been unloaded
3. **Data Integrity:** Prevents confusion about which cartons are ready for receiving
4. **Consistent Workflow:** Enforces the correct workflow: Unload → Receive

---

## 🔄 Workflow

1. **Unload Cartons** → Creates entries in `tabInboundUnloadLine`
   - Example: CTN-0101, CTN-0102, CTN-0103

2. **View Receive Lines** → Only shows items for unloaded cartons
   - Only CTN-0101, CTN-0102, CTN-0103 items are displayed

3. **Add Receive Line** → Only allows selecting from unloaded cartons
   - Cannot add receive lines for CTN-0104, CTN-0105, etc. until they are unloaded

---

## 📋 Files Modified

1. ✅ `ViewModels/InboundSessionDetailViewModel.cs`
   - Added filtering logic in constructor
   - Updated `AddReceiveLine` method to filter by unloaded cartons

---

## ✅ Testing

1. **Unload some cartons** (e.g., CTN-0101, CTN-0102)
2. **Open Inbound Session Details**
3. **Verify Receive Lines** only shows items for CTN-0101 and CTN-0102
4. **Try to add receive line** → Should only allow selecting from unloaded cartons

---

**Status:** ✅ **Fix Complete - Ready for Testing**

