# Transfer Carton Sealed - Items Not Showing Fix

## Issue

Transfer Carton `TC-MR-0001-1767524449896` is now **Sealed**, but items are still not showing in desktop app's "Carton Contents".

## Root Cause

The previous fix only handled "Created" status by looking back 6 hours before TC creation. However, for "Sealed" status, the logic was still using `createdOn` as the start time, which excluded events that happened **before** the TC was created.

**Problem:**
- Events occurred: `07:56:25` to `08:00:13` (10:56-11:00 local)
- TC Created: `11:00:47` (14:00 local)
- TC Sealed: `14:10` (local)
- Old logic for Sealed: Start = `createdOn` (11:00:47) → Events at 07:56-08:00 are **still excluded**!

## Solution

Updated the "Sealed" status logic to **also look back 6 hours before creation**, just like "Created" status.

### Updated Logic:

**For "Sealed" Status:**
- **Start Time:** `createdOn - 6 hours` (look back before TC creation)
- **End Time:** `sealedOn + 2 hours` (seal time + buffer)
- **Reason:** Events might happen before the TC is created in the system

**For "Created" Status:**
- **Start Time:** `createdOn - 6 hours` (look back before TC creation)
- **End Time:** `Now` (current time)
- **Reason:** Events might happen before the TC is created in the system

## Code Changes

**File:** `Services/TransferCartonService.cs`

**Before:**
```csharp
if (sealedOn.HasValue)
{
    // Sealed: Use creation time to seal time + 2 hours buffer
    startTime = createdOn ?? sealedOn.Value.AddHours(-6);
    endTime = sealedOn.Value.AddHours(2);
}
```

**After:**
```csharp
if (sealedOn.HasValue)
{
    // Sealed: Look back 6 hours before creation (events might happen before TC is created)
    // End at seal time + 2 hours buffer
    startTime = createdOn.HasValue ? createdOn.Value.AddHours(-6) : sealedOn.Value.AddHours(-6);
    endTime = sealedOn.Value.AddHours(2);
}
```

## Expected Behavior After Fix

1. **For "Created" Transfer Cartons:**
   - ✅ Looks back 6 hours before TC creation
   - ✅ Includes events up to current time
   - ✅ Catches events that happened before TC was created

2. **For "Sealed" Transfer Cartons:**
   - ✅ Looks back 6 hours before TC creation (NEW!)
   - ✅ Includes events up to seal time + 2 hours
   - ✅ Catches events that happened before TC was created

## Testing

Run test script:
```bash
cd wms-api
node test-sealed-tc.js
```

**Expected Results:**
- Time window: `createdOn - 6 hours` to `sealedOn + 2 hours`
- Events found: Should include events that happened before TC creation
- Items should now appear in desktop app

## Next Steps

1. **Rebuild Desktop App** to load the fix
2. **Verify:** Open Transfer Carton `TC-MR-0001-1767524449896` → Check "Carton Contents"
   - Items should now appear (10 events should be found)

## Summary

Both "Created" and "Sealed" status transfer cartons now use the same backward-looking time window logic to catch events that occurred before the TC was created in the system. This handles the mobile app workflow where items are packed before the transfer carton is created.

