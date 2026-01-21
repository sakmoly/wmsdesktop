# Relocation / Bin Transfer Implementation Status

## Overview

This document analyzes the current state of relocation/bin transfer functionality against the specification in `BACKEND_DESKTOP_Relocation_BinTransfer_Spec.md`.

## Current State Analysis

### ✅ Existing Infrastructure

#### 1. Database Tables (Partially Match Spec)

**Existing Tables:**
- ✅ `tabCarton` - Carton master table
  - Has: `carton_id`, `warehouse`, `current_bin_id`, `status`, `last_moved_on`
  - Similar to spec's `tab_carton_location` (but different structure)
  
- ✅ `tabCartonStock` - Carton-level inventory
  - Has: `carton_id`, `item_code`, `warehouse`, `bin_location`, `qty`
  - Similar to spec's `tab_carton_inventory`
  
- ✅ `tabCartonItem` - Items in cartons
  - Has: `carton_id`, `item_code`, `qty`, `uom`
  - Similar to spec's `tab_carton_inventory`

- ✅ `tabStockTransaction` - Transaction history
  - Has: `carton_id` column (for audit trail)
  - Needs: `from_carton`, `to_carton` fields for relocation tracking

**Missing Tables (Per Spec):**
- ❌ `tab_relocation_session` - Workflow tracking
- ❌ `tab_relocation_lines` - Partial move line items
- ❌ `tab_stock_dirty` - Self-healing flags

#### 2. Existing Functionality

**Carton Movement:**
- ✅ `CartonDataService.MoveCartonToBinAsync()` - Basic carton bin movement
  - Updates `tabCarton.current_bin_id`
  - Updates `tabCartonStock.bin_location`
  - **Missing**: Transaction history logging with carton IDs
  - **Missing**: Session-based workflow
  - **Missing**: Blind vs Verified modes

**Putaway:**
- ✅ Putaway endpoints handle carton location assignment
- ✅ Carton IDs stored in putaway lines
- **Missing**: Relocation-specific workflow

### ❌ Missing Features (Per Spec)

#### 1. Relocation Session Management

**Required:**
- ❌ `tab_relocation_session` table
- ❌ Session creation API (`POST /api/relocation/session/start`)
- ❌ Set FROM location API (`PUT /api/relocation/session/{session_id}/from`)
- ❌ Set TO location API (`PUT /api/relocation/session/{session_id}/to`)
- ❌ Commit endpoints (full/partial)

#### 2. Movement Modes

**Required:**
- ❌ Full Carton Move - BLIND (no item scanning)
- ❌ Full Carton Move - VERIFIED (scan items)
- ❌ Partial Move (items from carton A to carton B)
- ❌ Carton Merge/Split operations

#### 3. Transaction History Enhancement

**Required:**
- ❌ `from_carton` field in transaction history
- ❌ `to_carton` field in transaction history
- ❌ Transaction types: `CARTON_RELOCATION`, `PARTIAL_RELOCATION`, `CARTON_MERGE`, `CARTON_SPLIT`

#### 4. Self-Healing System

**Required:**
- ❌ `tab_stock_dirty` table
- ❌ Dirty flag marking logic
- ❌ Self-healing repair logic

## Implementation Plan

### Phase 1: Database Schema

#### 1.1 Create Relocation Session Table

```sql
CREATE TABLE IF NOT EXISTS tabRelocationSession (
  session_id VARCHAR(100) PRIMARY KEY,
  mode VARCHAR(50) NOT NULL,  -- FULL_CARTON | PARTIAL_ITEMS | CARTON_TO_CARTON
  policy VARCHAR(50) NOT NULL,  -- BLIND | VERIFIED
  warehouse_id VARCHAR(100) NOT NULL,
  from_bin VARCHAR(100) NULL,
  from_carton VARCHAR(100) NULL,
  to_bin VARCHAR(100) NULL,
  to_carton VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'IN_PROGRESS',  -- IN_PROGRESS | COMPLETED | CANCELLED
  created_by VARCHAR(255) NULL,
  device_id VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_warehouse (warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.2 Create Relocation Lines Table

```sql
CREATE TABLE IF NOT EXISTS tabRelocationLine (
  line_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  qty_moved DECIMAL(10,2) NOT NULL,
  barcode VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES tabRelocationSession(session_id) ON DELETE CASCADE,
  INDEX idx_session (session_id),
  INDEX idx_item (item_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.3 Enhance Transaction History

```sql
-- Add from_carton and to_carton if not exists
ALTER TABLE tabStockTransaction
ADD COLUMN IF NOT EXISTS from_carton VARCHAR(100) NULL AFTER carton_id,
ADD COLUMN IF NOT EXISTS to_carton VARCHAR(100) NULL AFTER from_carton;
```

#### 1.4 Create Stock Dirty Table

```sql
CREATE TABLE IF NOT EXISTS tabStockDirty (
  warehouse_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  dirty_reason VARCHAR(255) NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (warehouse_id, item_code),
  INDEX idx_marked_at (marked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Phase 2: Backend API Implementation

#### 2.1 Relocation Controller

**File**: `wms-api/src/modules/relocation/relocationController.js`

**Endpoints to Implement:**
1. `POST /api/relocation/session/start` - Start relocation session
2. `PUT /api/relocation/session/:session_id/from` - Set FROM location
3. `PUT /api/relocation/session/:session_id/to` - Set TO location
4. `GET /api/carton/:carton_id/contents` - Get carton contents
5. `POST /api/relocation/session/:session_id/line-scan` - Scan item (optional)
6. `PUT /api/relocation/session/:session_id/line` - Edit line
7. `POST /api/relocation/session/:session_id/commit-full` - Commit full carton move
8. `POST /api/relocation/session/:session_id/commit-partial` - Commit partial move

#### 2.2 Movement Logic Implementation

**Full Carton Move - BLIND:**
- Update `tabCarton.current_bin_id` (or `tabCartonStock.bin_location`)
- Insert transaction history with `txn_type='CARTON_RELOCATION'`
- **Do NOT** create per-item OUT/IN movements

**Full Carton Move - VERIFIED:**
- Verify scanned totals match `tabCartonStock`
- Update carton location
- Insert history with verification status

**Partial Move:**
- Decrement from source `tabCartonStock`
- Increment in destination `tabCartonStock`
- Create destination carton if new
- Insert item-level transaction history with `txn_type='PARTIAL_RELOCATION'`

### Phase 3: Desktop Integration

#### 3.1 Relocation UI

**Required:**
- Relocation session management screen
- Carton scanning interface
- Bin selection interface
- Item scanning for partial moves
- Session status display

### Phase 4: Transaction History Fix

#### 4.1 Ensure Carton IDs in History

**Current Issue:**
- Transaction history may have blank `carton_id` for relocation moves

**Fix:**
- Update all relocation transaction inserts to include `from_carton` and `to_carton`
- Update desktop Transaction History UI to display carton columns

## Mapping Existing Tables to Spec

| Spec Table | Existing Table | Status | Notes |
|------------|---------------|--------|-------|
| `tab_carton_location` | `tabCarton` | ✅ Partial | Has `current_bin_id`, but different structure |
| `tab_carton_inventory` | `tabCartonStock` | ✅ Match | Similar structure |
| `tab_relocation_session` | ❌ None | ❌ Missing | Need to create |
| `tab_relocation_lines` | ❌ None | ❌ Missing | Need to create |
| `tab_stock_transaction_history` | `tabStockTransaction` | ⚠️ Partial | Has `carton_id`, needs `from_carton`/`to_carton` |
| `tab_stock_dirty` | ❌ None | ❌ Missing | Need to create |

## Key Principles (From Spec)

1. ✅ **Reuse existing endpoints** - Modify in-place, don't duplicate
2. ✅ **Carton carries location** - Item location derived from carton
3. ✅ **Avoid double posting** - Don't create per-item movements for blind carton moves
4. ✅ **Transaction history must include carton IDs** - Critical for audit trail
5. ✅ **Self-healing approach** - Mark items dirty on failure, repair later

## Next Steps

1. **Create migration script** for new tables
2. **Implement relocation controller** with all endpoints
3. **Enhance transaction history** with `from_carton`/`to_carton`
4. **Update existing carton movement** to use relocation session workflow
5. **Create desktop UI** for relocation management
6. **Implement self-healing** system

## Summary

**Current Status**: ⚠️ **Partial Implementation**

- ✅ Basic carton movement exists (`MoveCartonToBinAsync`)
- ✅ Carton tables exist (`tabCarton`, `tabCartonStock`)
- ❌ Relocation session workflow missing
- ❌ Partial moves (carton to carton) missing
- ❌ Transaction history enhancement needed
- ❌ Self-healing system missing

**Recommendation**: Implement full relocation/bin transfer system per spec to support:
- Full carton moves (blind/verified)
- Partial carton moves
- Carton merge/split
- Proper audit trail with carton IDs
- Self-healing for data consistency
