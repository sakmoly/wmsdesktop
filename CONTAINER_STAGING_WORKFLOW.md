# Container (LPN) Staging Workflow

## Overview

**Containers (LPNs - Logical Processing Numbers)** are physical handling units (Cartons, Pallets, Totes) that move through the warehouse. The **"Staged"** status indicates a container is in a **staging area** - a temporary holding location before dispatch.

---

## Container Status Lifecycle

### Container Statuses:
1. **Empty** - Container is empty, ready to be loaded
2. **Loaded** - Container has items but not yet assigned to a location
3. **Staged** - Container is in staging area, ready for dispatch
4. **Shipped** - Container has been dispatched/shipped out

---

## Where Staging Fits in the Workflow

### 1. **Inbound Flow (Receiving → Putaway)**

```
Supplier → ASN → Receiving → Putaway → Storage Bin
                                    ↓
                              Container Status: "Loaded"
                              Current Bin: "RACK-A-01-BIN-05"
```

**No staging involved** - Items go directly from receiving to storage bins.

---

### 2. **Outbound Flow (Picking → Staging → Dispatch)**

```
Storage Bin → Picking → Staging Area → Dispatch → Store/Showroom
                                    ↓
                              Container Status: "Staged"
                              Current Bin: "STAGE-01" or "BIN-STAGE-01"
```

**Staging is used here** - Items are picked from storage and moved to staging before dispatch.

---

## Complete Workflow with Containers

### Workflow 1: ASN Receiving → Putaway (No Staging)

```
1. ASN Received
   └── Items received at DOCK-01
       └── Container Status: "Loaded"
       └── Current Bin: "DOCK-01"

2. Putaway Task Created
   └── Items moved to storage bin
       └── Container Status: "Loaded"
       └── Current Bin: "RACK-A-01-BIN-05"
```

**No staging** - Items go directly to storage.

---

### Workflow 2: Picking → Staging → Dispatch (Staging Used)

```
1. Picking Transaction Created
   └── Source: Storage Bin (RACK-A-01-BIN-05)
   └── Target: Staging Area (STAGE-01)

2. Items Picked from Storage
   └── Stock Ledger: -qty from RACK-A-01-BIN-05
   └── Stock Ledger: +qty to STAGE-01
   └── Container Status: "Staged"
   └── Current Bin: "STAGE-01"

3. Items in Staging Area
   └── Container Status: "Staged"
   └── Current Bin: "STAGE-01" or "BIN-STAGE-01"
   └── Ready for dispatch

4. Dispatch to Store/Showroom
   └── Stock Ledger: -qty from STAGE-01
   └── Container Status: "Shipped"
   └── Current Bin: null (dispatched)
```

**Staging is the intermediate step** between picking and dispatch.

---

### Workflow 3: Transfer Order (Sorting → Transfer Carton → Dispatch)

```
1. ASN Received with Transfer Order
   └── Items received at DOCK-01

2. Sorting Process
   └── Items sorted to Sort Boxes
   └── Sort Boxes packed to Transfer Cartons
   └── Container Status: "Loaded"
   └── Current Bin: "DOCK-01"

3. Transfer Carton Sealed
   └── Container Status: "Staged" (if staged before dispatch)
   └── Current Bin: "STAGE-01" (optional staging)

4. Dispatch to Showroom
   └── Container Status: "Shipped"
   └── Current Bin: null (dispatched)
```

**Staging is optional** - Transfer cartons can go directly to dispatch or be staged first.

---

## Staging Area Bin Locations

### Bin Location Naming Convention:
- **`STAGE-01`** - Staging area 01
- **`STAGE-01-SL-01`** - Staging area 01, Staging Lane 01
- **`BIN-STAGE-01`** - Staging bin 01
- **`STAGE-{store}`** - Store-specific staging (e.g., `STAGE-STORE001`)

### Stock Ledger Behavior:
- **Moving to Staging**: Stock moves from storage bin to staging bin (no net change, just location change)
- **Dispatching from Staging**: Stock decreases from staging bin (leaves warehouse)

---

## Container Workflow in Code

### 1. Picking Transaction with Staging

**File:** `Services/WmsTransactionAutoCreateService.cs`

```csharp
// When creating picking transaction for Transfer Order
TargetBin = $"STAGE-{store}",  // e.g., "STAGE-STORE001"
```

**File:** `Services/StockLedgerService.cs`

```csharp
// When processing picking transaction
if (item.TargetBin != null && item.TargetBin.StartsWith("STAGE-"))
{
    // Move to staging (no net change, just bin movement)
    // Decrease from source bin
    await UpdateStockAsync(..., binLocation: item.SourceBin, qtyChange: -item.Qty);
    
    // Increase in staging bin
    await UpdateStockAsync(..., binLocation: item.TargetBin, qtyChange: item.Qty);
}
```

---

## Database Tables (Not Yet Created)

### Required Tables for Container Tracking:

#### 1. `tabContainer` (or `tabLPN`)
```sql
CREATE TABLE IF NOT EXISTS tabContainer (
  container_id VARCHAR(100) PRIMARY KEY,  -- LPN-00001
  container_type VARCHAR(50) NOT NULL,     -- Carton / Pallet / Tote
  status VARCHAR(50) DEFAULT 'Empty',      -- Empty / Loaded / Staged / Shipped
  current_bin VARCHAR(100) NULL,           -- STAGE-01, RACK-A-01-BIN-05, etc.
  tare_weight DECIMAL(10,2) NULL,
  warehouse VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_current_bin (current_bin),
  INDEX idx_warehouse (warehouse)
);
```

#### 2. `tabContainerItem` (or `tabLPNItem`)
```sql
CREATE TABLE IF NOT EXISTS tabContainerItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_container_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  uom VARCHAR(50) NOT NULL,
  batch_no_serial_no VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_container_id),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_container_id) REFERENCES tabContainer(container_id) ON DELETE CASCADE
);
```

---

## Summary

### When is "Staged" Status Used?

1. **Picking Workflow** - Items picked from storage bins and moved to staging area before dispatch
2. **Transfer Carton** - Transfer cartons can be staged before dispatch to showroom
3. **Material Request** - Items picked for showroom can be staged before dispatch

### Where is Staging in the Workflow?

```
INBOUND:
Supplier → Receiving → Putaway → Storage Bin
                              (No staging)

OUTBOUND:
Storage Bin → Picking → Staging Area → Dispatch → Store/Showroom
                              ↑
                        Container Status: "Staged"
                        Current Bin: "STAGE-01"
```

### Key Points:

- **Staging is a temporary holding area** before dispatch
- **Staging bins** are named with `STAGE-` prefix (e.g., `STAGE-01`, `STAGE-STORE001`)
- **Stock movement to staging** is a location change (no net quantity change)
- **Stock dispatch from staging** decreases warehouse stock
- **Container status "Staged"** means it's in staging area, ready for dispatch

---

**Note:** The WMS Containers screen currently shows mock data. To make it functional, you need to:
1. Create `tabContainer` and `tabContainerItem` tables
2. Create `ContainerDataService` to read from database
3. Update `WmsContainerListViewModel` to load real data
4. Track container status changes during putaway, picking, and dispatch operations

