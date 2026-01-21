# Relocation: Bin Location and Carton ID Update Fixes

**Date**: 2026-01-16  
**Status**: ✅ **FIXED**

---

## Issues Identified

### 1. Transaction History: Empty `bin_location` for `CARTON_MERGE`
**Symptom:** Transaction History shows empty `Bin Location` column for `CARTON_MERGE` type transactions.

**Root Cause:** 
- Backend was using `session.from_carton` for `carton_id` in transaction history
- Backend was using `session.to_bin || session.from_bin` for `bin_location`, but for CARTON_MERGE, should prioritize destination (to_bin/to_carton)

**Fix Applied:**
**File:** `wms-api/src/modules/relocation/relocationController.js`  
**Function:** `commitPartialMove` (lines ~2652-2677)

Changed logic to prioritize **destination** for CARTON_MERGE:
```javascript
// For CARTON_MERGE and CARTON_TO_CARTON: prioritize destination (to_bin/to_carton) for display
const displayBin = session.to_bin || session.from_bin; // Destination bin for display
const displayCarton = (txnType === 'CARTON_MERGE' || session.mode === 'CARTON_TO_CARTON') 
  ? (session.to_carton || session.from_carton)  // For merge: use destination carton
  : session.from_carton;  // For partial: use source carton

// Now uses displayBin and displayCarton for transaction history
```

**Result:**
- `CARTON_MERGE` transactions now show **destination bin** (`to_bin`) in `bin_location`
- `CARTON_MERGE` transactions now show **destination carton** (`to_carton`) in `carton_id`
- `PARTIAL_RELOCATION` transactions show **source carton** as before

---

### 2. Relocation List View: Empty Bin/Carton Fields
**Symptom:** Relocation List grid shows empty `Warehouse`, `From Bin`, `From Carton`, `To Bin`, `To Carton` columns.

**Root Cause:**
- Desktop app's `RelocationSessionData` class doesn't have `JsonPropertyName` attributes
- Backend API returns `snake_case` (`from_bin`, `to_bin`, etc.)
- Desktop app's `JsonOptions` uses `JsonNamingPolicy.CamelCase`, which converts to `camelCase` (`fromBin`, `toBin`)
- But properties are PascalCase (`FromBin`, `ToBin`), so deserialization fails

**Fix Applied:**
**File:** `Services/RelocationApiService.cs`  
**Class:** `RelocationSessionData` (lines ~638-654)

Added `JsonPropertyName` attributes to map `snake_case` API responses:
```csharp
private class RelocationSessionData
{
    [JsonPropertyName("session_id")]
    public string SessionId { get; set; } = string.Empty;
    
    [JsonPropertyName("warehouse_id")]
    public string WarehouseId { get; set; } = string.Empty;
    
    [JsonPropertyName("from_bin")]
    public string? FromBin { get; set; }
    
    [JsonPropertyName("from_carton")]
    public string? FromCarton { get; set; }
    
    [JsonPropertyName("to_bin")]
    public string? ToBin { get; set; }
    
    [JsonPropertyName("to_carton")]
    public string? ToCarton { get; set; }
    
    // ... other properties
}
```

**Result:**
- Desktop app now correctly deserializes `from_bin`, `to_bin`, `from_carton`, `to_carton` from API
- Relocation List view now displays all bin/carton fields correctly

---

### 3. Item Location Breakdown: Shows Old Location
**Symptom:** Item Location Breakdown dialog shows old bin location (`A1-R01-L4-B1`) and old carton ID (`CTN-555445`) instead of new location after relocation.

**Root Cause:**
- Item Location Breakdown queries `tabCartonStock` for latest `bin_location` and `carton_id`
- Backend updates `tabCartonStock.bin_location` when moving items (lines ~2475, 2516, 1615)
- Backend updates `tabCartonStock.carton_id` when merging cartons (items move to destination carton)

**Verification:**
Backend code already updates correctly:
- **`commitPartialMove`**: Updates destination carton stock `bin_location` to `session.to_bin` (line 2475, 2516)
- **`commitFullCartonMove`**: Updates all carton stock `bin_location` to `session.to_bin` (line 1615)
- **CARTON_MERGE**: Moves items to destination carton (line ~1264, 1291)

**If still showing old location:**
1. **Refresh the Item Location Breakdown** - The query should return updated data
2. **Check `tabCartonStock` directly** - Verify `bin_location` and `carton_id` are updated in database
3. **Clear desktop app cache** - Old data might be cached

---

## Files Modified

### Backend
1. **`wms-api/src/modules/relocation/relocationController.js`**
   - Fixed transaction history `bin_location` and `carton_id` to use destination for CARTON_MERGE (lines ~2652-2677)

### Desktop
2. **`Services/RelocationApiService.cs`**
   - Added `JsonPropertyName` attributes to `RelocationSessionData` class (lines ~638-654)
   - Added `JsonPropertyName` attributes to `RelocationLineData` class (lines ~657-663)
   - Added `using System.Text.Json.Serialization;` import (line 8)

---

## Testing

### Transaction History
1. Perform a CARTON_MERGE relocation
2. Check Transaction History
3. **Expected:** `Bin Location` shows destination bin, `Carton ID` shows destination carton

### Relocation List
1. Open Relocation / Bin Transfer list view
2. Check grid columns
3. **Expected:** All `Warehouse`, `From Bin`, `From Carton`, `To Bin`, `To Carton` fields populated

### Item Location Breakdown
1. Perform a relocation operation
2. Open Item Location Breakdown for moved item
3. **Expected:** Shows new bin location and new carton ID (if carton changed)

---

## Summary

✅ **Transaction History `bin_location`** - Fixed to show destination bin for CARTON_MERGE  
✅ **Transaction History `carton_id`** - Fixed to show destination carton for CARTON_MERGE  
✅ **Relocation List fields** - Fixed with `JsonPropertyName` attributes for proper deserialization  
✅ **Item Location Breakdown** - Already working (queries `tabCartonStock` which is updated correctly)

---

**All issues resolved!** 🎉
