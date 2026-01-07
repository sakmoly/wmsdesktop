# Stock Update Fix - Only on Completion

## Problem
Stock was being updated **twice**:
1. When location is scanned (`scanTransferCarton`) - **WRONG** ❌
2. When putaway is completed (`completePutaway`) - **CORRECT** ✅

This caused stock to be doubled (e.g., 400 → 800).

## Solution Applied

### ✅ Fixed: Stock Update Only on Completion

**Removed stock updates from:**
1. `scanTransferCarton` - Now only updates location/rack/bin
2. `updatePutawayTaskLocation` - Now only updates location/rack/bin

**Stock update remains only in:**
- `completePutaway` - Updates stock when status changes to "Completed" ✅

## Current Workflow

### 1. Close Box
- Creates putaway task
- Creates putaway lines
- **No stock update** ✅

### 2. Scan Location (`POST /api/putaway/scan-transfer-carton`)
- Updates location/rack/bin on lines
- Changes status to "In Progress"
- **No stock update** ✅

### 3. Complete Putaway (`POST /api/putaway/complete`)
- Updates stock ledger (`tabStockLedger`)
- Creates stock transaction (`tabStockTransaction`)
- Updates item stock qty (`tabItem.stock_qty`)
- Changes status to "Completed"
- **Stock updated here** ✅

## Response Changes

### `scanTransferCarton` Response:
```json
{
  "ok": true,
  "data": {
    "stock_updated": false,  // Changed from true
    // stock_updates removed
  }
}
```

### `updatePutawayTaskLocation` Response:
```json
{
  "ok": true,
  "data": {
    "stock_updated": false,  // Changed from true
    // stock_updates removed
  }
}
```

### `completePutaway` Response (unchanged):
```json
{
  "ok": true,
  "data": {
    "stock_updated": true,  // Still true
    "stock_updates": [...]
  }
}
```

## Testing

1. **Close Box** → Verify no stock update
2. **Scan Location** → Verify no stock update (check logs)
3. **Complete Putaway** → Verify stock updated once ✅

Stock should now be updated **only once** when putaway is completed!

