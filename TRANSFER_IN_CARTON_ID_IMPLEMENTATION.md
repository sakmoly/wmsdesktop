# Transfer In Carton ID Backend Implementation

## Summary

Implemented backend processing for `TRANSFER_IN_RECEIVE` events to extract and save `carton_id` to Transfer In item lines.

## Changes Made

### 1. Event Field Extraction

**File:** `wms-api/src/modules/events/eventController.js`

Added `transfer_in` field extraction from events:

```javascript
const {
  // ... existing fields ...
  transfer_in = null,        // Support transfer_in field (for TRANSFER_IN_RECEIVE events)
  // ... other fields ...
} = event;
```

### 2. Event Processing Handler

Added processing for `TRANSFER_IN_RECEIVE` events after event insertion:

```javascript
// Process TRANSFER_IN_RECEIVE events - update Transfer In item lines with carton_id
if (event_type && event_type.toUpperCase() === 'TRANSFER_IN_RECEIVE' && transfer_in && item_code && carton_id) {
  try {
    await processTransferInReceiveEvent(connection, {
      transfer_in,
      item_code,
      carton_id,
      qty,
      user_id
    });
  } catch (transferInError) {
    console.warn(`Failed to process TRANSFER_IN_RECEIVE event:`, transferInError.message);
    // Don't fail the event insertion if transfer in processing fails
  }
}
```

### 3. Processing Function

Created `processTransferInReceiveEvent` function that:

1. **Validates** Transfer In document exists
2. **Validates** Transfer In item line exists
3. **Checks** if `carton_id` column exists in `tabTransferInItem`
4. **Updates** `tabTransferInItem` with:
   - `carton_id` (sets if NULL, otherwise keeps existing)
   - `received_qty` (incremental update)

## Implementation Details

### Function: `processTransferInReceiveEvent`

**Location:** `wms-api/src/modules/events/eventController.js` (after line 1426)

**Parameters:**
- `connection`: Database connection
- `data`: Object containing:
  - `transfer_in`: Transfer In document number
  - `item_code`: Item code
  - `carton_id`: Carton ID from event
  - `qty`: Quantity received (incremental)
  - `user_id`: User who performed the action

**Behavior:**
- Updates `carton_id` only if currently NULL (preserves existing carton_id)
- Incrementally updates `received_qty`
- Logs success/failure for debugging
- Does not throw errors (allows event insertion to continue)

### Database Update

```sql
UPDATE tabTransferInItem
SET received_qty = ?,
    carton_id = COALESCE(carton_id, ?), -- Set carton_id if currently NULL
    updated_at = NOW()
WHERE parent_title = ?
  AND item_code = ?
```

## Event Flow

### Mobile App → Backend

1. **Mobile app scans item** → Creates `TRANSFER_IN_RECEIVE` event with `carton_id`
2. **Mobile app syncs event** → Calls `/api/events/batch` with event
3. **Backend processes event**:
   - Inserts event into `tabWmsScanEvent`
   - Calls `processTransferInReceiveEvent`
   - Updates `tabTransferInItem` with `carton_id`
   - Updates `received_qty` incrementally

### Transaction History

Transaction History is automatically created via database trigger when stock transactions are posted. The `carton_id` will be included in the transaction history if it's set in `tabTransferInItem` when stock is posted.

**Note:** Stock posting for Transfer In happens in the `/api/transfer-in/{title}/receive-line` endpoint, not in event processing. The `carton_id` is now set in `tabTransferInItem` so it will be available when stock is posted.

## Testing Checklist

- [x] Code implemented
- [ ] Test: Mobile app sends `TRANSFER_IN_RECEIVE` event with `carton_id`
- [ ] Verify: `tabTransferInItem.carton_id` is populated
- [ ] Verify: `tabTransferInItem.received_qty` is updated incrementally
- [ ] Verify: Carton ID appears in Transfer In Details screen (desktop app)
- [ ] Verify: Transaction History includes `carton_id` for Transfer In transactions

## Event Payload Example

```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "event_type": "TRANSFER_IN_RECEIVE",
      "transfer_in": "INSLIP-123462",
      "carton_id": "CTN-12345",
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 1,
      "device_id": "DEV-001",
      "user_id": "USER-001",
      "event_time": "2025-01-25T10:30:00.000Z"
    }
  ]
}
```

## Multiple Cartons Support

**Current Strategy:** `carton_id` is set if NULL, otherwise kept existing.

**Options for Future Enhancement:**
- **Option 1:** Store latest `carton_id` (overwrite)
- **Option 2:** Store all `carton_id`s (comma-separated or separate records)
- **Option 3:** Store `carton_id` per quantity (if tracking qty per carton)

## Error Handling

- Missing required fields: Logs warning, skips processing
- Transfer In not found: Logs warning, skips processing
- Item not found: Logs warning, skips processing
- Column doesn't exist: Logs warning, skips processing
- Database errors: Logs error, allows event insertion to continue

## Logging

The function logs:
- ✅ Success: `Updated Transfer In item: {item_code} in {transfer_in} with carton_id={carton_id}, received_qty={newReceivedQty}`
- ⚠️ Warnings: Missing fields, not found, column doesn't exist
- ❌ Errors: Database errors

## Related Files

- `wms-api/src/modules/events/eventController.js` - Event processing
- `wms-api/src/modules/transfer-in/transferInController.js` - Transfer In endpoints
- `SCRIPTS/AutoSetupTransactionHistory.sql` - Transaction History trigger

## Status

✅ **IMPLEMENTATION COMPLETE**

The backend now processes `TRANSFER_IN_RECEIVE` events and updates `tabTransferInItem` with `carton_id`. The Carton ID field in Transfer In Details should now be populated correctly.
