# Bin + Carton Level Inventory Analysis & Implementation Plan

## 📋 Executive Summary

**Customer Requirement:** Implement inventory tracking at **Bin Location + Carton Level** for:
- Receiving (Putaway)
- Transfer IN (Putaway)
- Pick (Transfer Out)
- Cycle Count

**Key Feature:** System setting to toggle between:
- **Bin Level Inventory** (current implementation)
- **Box/Carton Level Inventory** (new requirement)

---

## 🔍 Current State Analysis

### 1. Current Inventory Tracking

**Table: `tabStockLedger`**
```sql
- item_code (VARCHAR)
- warehouse (VARCHAR)
- bin_location (VARCHAR, nullable)  -- e.g., "RACK-A-BIN-01"
- qty (DECIMAL)
- reserved_qty (DECIMAL)
- available_qty (calculated)
```

**Current Tracking Level:** `Item + Warehouse + Bin Location`
- ❌ **No Carton ID tracking**
- ❌ **No Carton-level inventory**

### 2. Current Putaway Implementation

**Table: `tabPutawayLine`**
```sql
- carton_id (VARCHAR, nullable)  -- ✅ EXISTS but NOT used for inventory
- item_code (VARCHAR)
- qty (DECIMAL)
- rack (VARCHAR)
- bin (VARCHAR)
- location_id (VARCHAR, nullable)
```

**Current Behavior:**
- ✅ Stores `carton_id` in putaway line
- ❌ Stock ledger updated at **item + bin level only**
- ❌ Carton ID **not stored** in stock ledger
- ❌ Cannot track which carton is in which bin

### 3. Current Picking Implementation

**Current Behavior:**
- Reduces stock from `item_code + warehouse + bin_location`
- ❌ No carton-level picking
- ❌ Cannot pick specific cartons

### 4. Current Cycle Count Implementation

**Table: `tabCycleCountLine`**
```sql
- item_code (VARCHAR)
- bin_location (VARCHAR, nullable)
- expected_qty (DECIMAL)
- actual_qty (DECIMAL)
```

**Current Behavior:**
- Counts by `item_code + bin_location`
- ❌ No carton-level counting
- ❌ Cannot count specific cartons

### 5. Current Settings System

**File:** `Models/WmsSettings.cs`
- Stores settings in JSON file (`wms_settings.json`)
- Can add new properties easily
- Settings are loaded/saved via `SettingsService`

---

## 🎯 Required Changes

### Phase 1: Database Schema Changes

#### 1.1 Add Inventory Mode Setting

**Add to `WmsSettings` Model:**
```csharp
public string InventoryTrackingMode { get; set; } = "BinLevel"; 
// Options: "BinLevel" | "CartonLevel"
```

**Default:** `"BinLevel"` (maintains backward compatibility)

#### 1.2 Extend Stock Ledger Table

**Option A: Add `carton_id` column (Recommended)**
```sql
ALTER TABLE tabStockLedger
ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location;

-- Update unique key to include carton_id when carton_id is not null
ALTER TABLE tabStockLedger
DROP INDEX uk_item_warehouse_bin;

-- Create conditional unique key
-- Note: MySQL doesn't support partial unique indexes directly
-- Workaround: Use application logic OR create separate table for carton-level stock
```

**Option B: Create Separate Carton Stock Table (Better for Performance)**
```sql
-- New table for carton-level inventory
CREATE TABLE IF NOT EXISTS tabCartonStock (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  carton_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  uom VARCHAR(50) NULL,
  batch_no VARCHAR(100) NULL,
  serial_no VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'PUTAWAY', -- PUTAWAY, PICKED, SHIPPED, ADJUSTED
  last_moved_on TIMESTAMP NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_carton_item (carton_id, item_code, batch_no),
  INDEX idx_carton_id (carton_id),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Option C: Hybrid Approach (Recommended)**
- Keep `tabStockLedger` for bin-level (when `carton_id IS NULL`)
- Create `tabCartonStock` for carton-level tracking
- Use setting to determine which table to update

#### 1.3 Create Carton Master Table

```sql
CREATE TABLE IF NOT EXISTS tabCarton (
  carton_id VARCHAR(100) PRIMARY KEY,
  asn_no VARCHAR(100) NULL,
  supplier_carton_barcode VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'RECEIVED_NOT_PUTAWAY', 
  -- RECEIVED_NOT_PUTAWAY, PUTAWAY, PICKED, SHIPPED, ADJUSTED
  current_bin_id VARCHAR(100) NULL, -- FK to bin location
  warehouse VARCHAR(100) NOT NULL,
  last_moved_on TIMESTAMP NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  remarks TEXT NULL,
  INDEX idx_asn_no (asn_no),
  INDEX idx_status (status),
  INDEX idx_current_bin (current_bin_id),
  INDEX idx_warehouse (warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.4 Create Carton Item Table

```sql
CREATE TABLE IF NOT EXISTS tabCartonItem (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  carton_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  uom VARCHAR(50) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  batch_no VARCHAR(100) NULL,
  serial_no VARCHAR(100) NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (carton_id) REFERENCES tabCarton(carton_id) ON DELETE CASCADE,
  INDEX idx_carton_id (carton_id),
  INDEX idx_item_code (item_code),
  INDEX idx_batch_no (batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 1.5 Extend Stock Transaction Table

```sql
ALTER TABLE tabStockTransaction
ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location;
```

#### 1.6 Create Bin Master Table (if not exists)

```sql
CREATE TABLE IF NOT EXISTS tabBin (
  bin_id VARCHAR(100) PRIMARY KEY,
  warehouse_id VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL,
  aisle VARCHAR(100) NULL,
  rack VARCHAR(100) NULL,
  level VARCHAR(100) NULL,
  position VARCHAR(100) NULL,
  barcode VARCHAR(100) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  bin_type VARCHAR(50) DEFAULT 'STORAGE',
  -- STORAGE, DOCK, STAGING, PICK, DAMAGE, QA
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_warehouse (warehouse_id),
  INDEX idx_bin_type (bin_type),
  INDEX idx_barcode (barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### Phase 2: Settings Implementation

#### 2.1 Update WmsSettings Model

**File:** `Models/WmsSettings.cs`

```csharp
private string _inventoryTrackingMode = "BinLevel";

public string InventoryTrackingMode
{
    get => _inventoryTrackingMode;
    set 
    { 
        if (value != "BinLevel" && value != "CartonLevel")
            throw new ArgumentException("InventoryTrackingMode must be 'BinLevel' or 'CartonLevel'");
        _inventoryTrackingMode = value; 
        OnPropertyChanged(); 
    }
}
```

#### 2.2 Update Settings View

**File:** `Views/SettingsView.xaml`

Add radio buttons or dropdown:
```xml
<ComboBox x:Name="InventoryTrackingModeComboBox"
          SelectedItem="{Binding Settings.InventoryTrackingMode}">
    <ComboBoxItem Content="Bin Level Inventory" Tag="BinLevel"/>
    <ComboBoxItem Content="Carton Level Inventory" Tag="CartonLevel"/>
</ComboBox>
```

#### 2.3 Update Settings Service

**File:** `Services/SettingsService.cs`

Add to `WmsSettingsDto`:
```csharp
public string InventoryTrackingMode { get; set; } = "BinLevel";
```

---

### Phase 3: Service Layer Changes

#### 3.1 Create Carton Service

**New File:** `Services/CartonDataService.cs`

```csharp
public static class CartonDataService
{
    // Create carton
    public static async Task<string> CreateCartonAsync(...)
    
    // Get carton by ID
    public static async Task<Carton?> GetCartonAsync(string cartonId)
    
    // Update carton bin location
    public static async Task<bool> MoveCartonToBinAsync(string cartonId, string binId)
    
    // Get carton items
    public static async Task<List<CartonItem>> GetCartonItemsAsync(string cartonId)
    
    // Get cartons in bin
    public static async Task<List<Carton>> GetCartonsInBinAsync(string binId, string warehouse)
}
```

#### 3.2 Update Stock Ledger Service

**File:** `Services/StockLedgerService.cs`

**Add carton-aware methods:**
```csharp
// Check inventory mode
private static bool IsCartonLevelMode()
{
    var settings = SettingsService.LoadSettings();
    return settings?.InventoryTrackingMode == "CartonLevel";
}

// Update stock (carton-aware)
public static async Task UpdateStockAsync(
    ...,
    string? cartonId = null)
{
    if (IsCartonLevelMode() && !string.IsNullOrEmpty(cartonId))
    {
        // Update tabCartonStock
        await UpdateCartonStockAsync(...);
    }
    else
    {
        // Update tabStockLedger (existing logic)
        await UpdateBinLevelStockAsync(...);
    }
}
```

#### 3.3 Update Putaway Service

**File:** `Services/PutawayTaskDataService.cs`

**Modify putaway completion:**
- When `InventoryTrackingMode == "CartonLevel"`:
  - Create/update carton in `tabCarton`
  - Create carton items in `tabCartonItem`
  - Update `tabCartonStock` instead of `tabStockLedger`
  - Update carton `current_bin_id`

#### 3.4 Update Picking Service

**File:** `Services/MaterialRequestDataService.cs` (or relevant service)

**Modify picking:**
- When `InventoryTrackingMode == "CartonLevel"`:
  - Require `carton_id` in pick request
  - Validate carton is in correct bin
  - Reduce from `tabCartonStock`
  - Update carton status to "PICKED"

#### 3.5 Update Cycle Count Service

**File:** `Services/CycleCountTaskDataService.cs`

**Modify cycle count:**
- When `InventoryTrackingMode == "CartonLevel"`:
  - Count by carton instead of item
  - Show expected cartons per bin
  - Record counted cartons
  - Handle missing/extra cartons

---

### Phase 4: API Changes (Backend)

#### 4.1 Putaway API Updates

**File:** `wms-api/src/modules/putaway/putawayController.js`

**POST /api/putaway/complete**
- Check inventory mode setting
- If carton level:
  - Require `carton_id` in request
  - Create/update `tabCarton`
  - Create `tabCartonItem` records
  - Update `tabCartonStock`
  - Update carton `current_bin_id`

#### 4.2 Picking API Updates

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**POST /api/material-request/pick**
- If carton level:
  - Require `carton_id` and `bin_id`
  - Validate carton is in bin
  - Reduce from `tabCartonStock`
  - Update carton status

#### 4.3 Cycle Count API Updates

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**POST /api/cycle-count/:title/count**
- If carton level:
  - Accept carton-level counts
  - Compare expected vs actual cartons
  - Handle carton discrepancies

#### 4.4 New Carton API Endpoints

```javascript
// Get carton details
GET /api/cartons/:carton_id

// Get cartons in bin
GET /api/bins/:bin_id/cartons

// Move carton between bins
POST /api/cartons/:carton_id/move
{
  "from_bin_id": "...",
  "to_bin_id": "...",
  "user_id": "..."
}
```

---

### Phase 5: UI Changes (Desktop)

#### 5.1 Putaway Screen Updates

**File:** `ViewModels/PutawayTaskDetailViewModel.cs`

**When Carton Level Mode:**
- Show carton ID field (mandatory)
- Show current bin of carton
- Show carton contents summary
- Validate carton exists and is in correct source bin

#### 5.2 Picking Screen Updates

**File:** `ViewModels/MaterialRequestDetailViewModel.cs`

**When Carton Level Mode:**
- Show allocation grid with: bin, carton, qty available
- Require bin + carton scan
- Show carton contents
- Block wrong bin/carton picks

#### 5.3 Cycle Count Screen Updates

**File:** `ViewModels/CycleCountTaskDetailViewModel.cs`

**When Carton Level Mode:**
- Show expected cartons per bin
- Allow carton-level counting
- Show carton contents
- Handle missing/extra cartons

---

## 🔄 Workflow Changes

### Receiving (Putaway) - Carton Level Mode

```
1. Receive Carton
   ↓
2. Create Carton in tabCarton (status: RECEIVED_NOT_PUTAWAY)
   ↓
3. Create Carton Items in tabCartonItem
   ↓
4. Assign to DOCK/STAGING bin
   ↓
5. Putaway: Scan Carton → Scan Destination Bin
   ↓
6. Validate:
   - Carton exists
   - Carton is in source bin (DOCK/STAGING)
   - Destination bin is valid
   ↓
7. Update:
   - tabCarton.current_bin_id = destination_bin
   - tabCarton.status = PUTAWAY
   - tabCartonStock (create/update)
   - tabStockTransaction (with carton_id)
```

### Picking - Carton Level Mode

```
1. Material Request Created
   ↓
2. Allocation (FEFO/FIFO):
   - Find cartons in pick bins
   - Prefer cartons in pick zone
   - Exclude DAMAGE/QA/HOLD bins
   ↓
3. Pick: Scan Bin → Scan Carton → Confirm
   ↓
4. Validate:
   - Carton is in scanned bin
   - Carton has required items
   - Sufficient qty in carton
   ↓
5. Update:
   - Reduce tabCartonStock
   - Update tabCartonItem.qty (if partial)
   - Update tabCarton.status (if fully picked)
   - Create tabStockTransaction
```

### Cycle Count - Carton Level Mode

```
1. Create Cycle Count Task
   ↓
2. Load Expected:
   - Get cartons per bin from tabCartonStock
   - Show expected carton list
   ↓
3. Count:
   - Scan bin
   - Scan each carton in bin
   - Enter actual qty per carton item
   ↓
4. Compare:
   - Missing cartons → ADJUST_OUT
   - Extra cartons → ADJUST_IN
   - Wrong bin cartons → MOVE
   ↓
5. Post Variance:
   - Update tabCartonStock
   - Create adjustment transactions
```

---

## 📊 Data Model Summary

### Carton Level Mode Tables

1. **tabCarton** - Carton master
2. **tabCartonItem** - Items in carton
3. **tabCartonStock** - Carton-level inventory (item + carton + bin)
4. **tabBin** - Bin master (if not exists)
5. **tabStockLedger** - Still used for bin-level aggregation (optional)
6. **tabStockTransaction** - Extended with carton_id

### Bin Level Mode Tables (Current)

1. **tabStockLedger** - Item + warehouse + bin
2. **tabStockTransaction** - Transaction log

---

## ✅ Implementation Checklist

### Database
- [ ] Create `tabCarton` table
- [ ] Create `tabCartonItem` table
- [ ] Create `tabCartonStock` table
- [ ] Create `tabBin` table (if not exists)
- [ ] Add `carton_id` to `tabStockTransaction`
- [ ] Migration script for existing data

### Settings
- [ ] Add `InventoryTrackingMode` to `WmsSettings`
- [ ] Update `SettingsService` to save/load mode
- [ ] Add UI control in Settings view
- [ ] Default to "BinLevel" for backward compatibility

### Services
- [ ] Create `CartonDataService`
- [ ] Update `StockLedgerService` (carton-aware)
- [ ] Update `PutawayTaskDataService`
- [ ] Update `MaterialRequestDataService` (picking)
- [ ] Update `CycleCountTaskDataService`

### API (Backend)
- [ ] Update putaway endpoints
- [ ] Update picking endpoints
- [ ] Update cycle count endpoints
- [ ] Create carton management endpoints
- [ ] Add inventory mode check in all endpoints

### UI (Desktop)
- [ ] Update Putaway screen
- [ ] Update Picking screen
- [ ] Update Cycle Count screen
- [ ] Add carton selection/scanning
- [ ] Show carton details

### Testing
- [ ] Test bin-level mode (existing functionality)
- [ ] Test carton-level mode (new functionality)
- [ ] Test mode switching
- [ ] Test data migration
- [ ] Test all workflows (Receiving, Putaway, Picking, Cycle Count)

---

## 🚨 Important Considerations

### 1. Backward Compatibility
- Default mode must be "BinLevel"
- Existing data should work without changes
- Migration should be optional (only if switching to carton level)

### 2. Performance
- Carton-level queries may be slower (more joins)
- Consider indexing strategy
- May need `tabBinCartonBalance` for performance (as per document)

### 3. Data Migration
- If switching to carton level:
  - Need to create cartons from existing putaway lines
  - Assign cartons to bins based on stock ledger
  - May require manual intervention for historical data

### 4. Validation Rules
- Carton must be unique across warehouse
- Carton must be in exactly one bin at a time
- Cannot pick from carton in wrong bin
- Cannot putaway carton that's already putaway (unless moving)

### 5. Edge Cases
- Carton scanned but not in system → create with reason
- Carton in wrong bin → show error, allow move with approval
- Same carton in two bins → block duplicate
- Negative stock prevention → validate carton qty

---

## 📝 Next Steps

1. **Review this document** with stakeholders
2. **Decide on database approach** (Option A, B, or C)
3. **Create detailed migration plan** for existing data
4. **Prioritize implementation phases**
5. **Set up development environment** for testing
6. **Create test scenarios** for both modes
7. **Implement Phase 1** (Database + Settings)
8. **Implement Phase 2-5** (Services, API, UI)
9. **Testing & Validation**
10. **Deployment**

---

## 📚 References

- Document 1: Desktop Application Changes (.NET WMS)
- Current codebase analysis
- Existing migration scripts
- Current API documentation

---

**Document Version:** 1.0  
**Created:** 2026-01-06  
**Status:** Draft - Pending Review

