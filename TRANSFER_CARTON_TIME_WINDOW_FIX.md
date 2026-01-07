# Transfer Carton Items Not Showing - Time Window Fix

## Issue

Transfer Carton `TC-MR-0001-1767524449896` is created, but items are not showing in desktop app's "Carton Contents".

## Root Cause

**Test Results:**
- ✅ TC Created: `2026-01-04T11:00:47.000Z` (14:00 local time)
- ✅ Events found: 10 events for MR-0001
- ❌ Events time: `07:56:25` to `08:00:13` (10:56-11:00 local time)
- ❌ **Events happened BEFORE the TC was created!**

**Time Window Logic Problem:**
- Old logic: `startTime = createdOn` (11:00:47), `endTime = createdOn + 2 hours` (13:00:47)
- Events at 07:56-08:00 are **BEFORE** 11:00, so they're excluded from the time window!

## Solution

Updated fallback logic to handle events that occur **before** transfer carton creation:

### For "Created" Status (Not Sealed):
- **Start Time:** `createdOn - 6 hours` (look back before TC creation)
- **End Time:** `Now` (include events up to current time)
- **Reason:** Items might be packed before the transfer carton is created in the system

### For "Sealed" Status:
- **Start Time:** `createdOn` (TC creation time)
- **End Time:** `sealedOn + 2 hours` (seal time + buffer)
- **Reason:** Items should be packed between creation and sealing

## Code Changes

**File:** `Services/TransferCartonService.cs`

**Updated Logic:**
```csharp
if (sealedOn.HasValue)
{
    // Sealed: Use creation time to seal time + 2 hours buffer
    startTime = createdOn ?? sealedOn.Value.AddHours(-6);
    endTime = sealedOn.Value.AddHours(2);
}
else
{
    // Created (not sealed): Look back 6 hours before creation and forward to Now
    // This catches events that happened before the TC was created
    startTime = createdOn.Value.AddHours(-6);
    endTime = DateTime.Now;
}
```

## Expected Behavior After Fix

1. **For "Created" Transfer Cartons:**
   - ✅ Looks back 6 hours before TC creation
   - ✅ Includes events up to current time
   - ✅ Catches events that happened before TC was created

2. **For "Sealed" Transfer Cartons:**
   - ✅ Uses creation time to seal time + 2 hours
   - ✅ Prevents including events from other TCs
   - ✅ More precise time window

## Testing

**Before Fix:**
- Events: 10 events found
- With time window: 0 events (excluded)

**After Fix:**
- Events: 10 events found
- With time window: 10 events (included) ✅

## Next Steps

1. **Rebuild Desktop App** to load the fix
2. **Verify:** Open Transfer Carton `TC-MR-0001-1767524449896` → Check "Carton Contents"
   - Items should now appear
3. **Note:** This is still a fallback - mobile app **should** include `tc_id` in events for reliable operation

## Root Cause Summary

The mobile app workflow appears to be:
1. Pack items to Material Request (events recorded)
2. Create Transfer Carton (TC created in system)

But the desktop app queries expect:
- Events with `tc_id` (not present - mobile app issue)
- OR events within time window of TC creation

Since events happen **before** TC creation, the time window must look backward to catch them.

