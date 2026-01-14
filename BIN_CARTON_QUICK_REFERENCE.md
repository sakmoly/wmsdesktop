# Bin + Carton Level Inventory - Quick Reference Guide

## 🎯 Quick Start

### 1. Enable Carton-Level Mode
**Settings → Inventory Tracking Mode → Carton Level Inventory → Save**

### 2. Run Migration
```sql
SOURCE MIGRATION_005_BIN_CARTON_INVENTORY.sql;
```

### 3. Use the System
- **Putaway:** Cartons automatically created/updated
- **Picking:** Select carton from available list
- **Cycle Count:** Load expected cartons per bin

---

## 📋 Key Settings

**Location:** Settings → Inventory Tracking Mode

**Options:**
- `BinLevel` - Track at item + warehouse + bin (default)
- `CartonLevel` - Track at item + warehouse + bin + carton

**Default:** `BinLevel` (backward compatible)

---

## 🔧 Key Services

### CartonDataService
```csharp
// Get carton
var carton = await CartonDataService.GetCartonAsync(settings, cartonId);

// Get cartons in bin
var cartons = await CartonDataService.GetCartonsInBinAsync(settings, binId, warehouse);

// Move carton
await CartonDataService.MoveCartonToBinAsync(settings, cartonId, toBinId, warehouse);

// Update carton stock
await CartonDataService.UpdateCartonStockAsync(settings, cartonId, itemCode, warehouse, binLocation, qtyChange);
```

### PutawayTaskDataService
```csharp
// Create/update cartons from putaway
await PutawayTaskDataService.CreateOrUpdateCartonsFromPutawayAsync(settings, putawayTaskTitle);
```

### MaterialRequestDataService
```csharp
// Validate carton picking
var (isValid, error) = await MaterialRequestDataService.ValidateCartonLevelPickingAsync(
    settings, cartonId, itemCode, sourceBin, warehouse, qty);

// Get available cartons
var cartons = await MaterialRequestDataService.GetAvailableCartonsForPickingAsync(
    settings, itemCode, sourceBin, warehouse, requestedQty);
```

### CycleCountTaskDataService
```csharp
// Get expected cartons
var cartons = await CycleCountTaskDataService.GetExpectedCartonsForBinAsync(
    settings, binLocation, warehouse);

// Create count lines from cartons
await CycleCountTaskDataService.CreateCycleCountLinesFromCartonsAsync(
    settings, cycleCountTitle, binLocation, warehouse);
```

---

## 📊 Database Tables

| Table | Purpose |
|-------|---------|
| `tabBin` | Bin master (physical locations) |
| `tabCarton` | Carton master (carton lifecycle) |
| `tabCartonItem` | Items in cartons |
| `tabCartonStock` | Carton-level inventory |
| `tabStockLedger` | Bin-level inventory (existing) |
| `tabStockTransaction` | Transaction log (with carton_id) |

---

## 🎨 UI Features

### Putaway Screen
- **Carton Details Panel** (right side)
  - Shows when carton mode enabled
  - Displays: Current Bin, Status, Items
  - Updates when line selected

### Picking Screen
- **Available Cartons Panel** (right side)
  - Shows when carton mode enabled
  - Enter source bin to see cartons
  - Displays: Carton ID, Available Qty

### Cycle Count Screen
- **Expected Cartons Panel** (right side)
  - Shows when carton mode enabled
  - Click "Load Expected Cartons"
  - Displays: Carton ID, Item Code, Expected Qty

---

## 🔄 Workflows

### Putaway (Carton Mode)
```
1. Receive items → Cartons created
2. Putaway → Cartons moved to bins
3. Stock updated in tabCartonStock
4. Carton status: RECEIVED_NOT_PUTAWAY → PUTAWAY
```

### Picking (Carton Mode)
```
1. Select item → Enter source bin
2. View available cartons
3. Select carton → Validate
4. Pick → Reduce carton stock
5. Carton status: PUTAWAY → PICKED
```

### Cycle Count (Carton Mode)
```
1. Select bin location
2. Load expected cartons
3. Count cartons physically
4. Compare expected vs actual
5. Post adjustments
```

---

## ⚠️ Important Notes

1. **Mode Switching:** Change in Settings, no restart needed
2. **Backward Compatible:** Bin-level mode works as before
3. **Carton ID:** Must be unique, can be auto-generated
4. **Validation:** Carton must be in correct bin before picking
5. **Migration:** Run once before using carton mode

---

## 🐛 Troubleshooting

### Cartons not showing
- Check inventory mode is "CartonLevel"
- Verify migration script ran successfully
- Check carton exists in `tabCarton` table

### Validation errors
- Ensure carton is in correct bin
- Check carton status allows operation
- Verify sufficient stock in carton

### UI panels not visible
- Check `IsCartonLevelMode` is true
- Verify converter is registered
- Check XAML visibility bindings

---

## 📞 Support

For detailed information, see:
- `BIN_CARTON_INVENTORY_ANALYSIS.md` - Full analysis
- `IMPLEMENTATION_COMPLETE_SUMMARY.md` - Complete summary
- `MIGRATION_005_BIN_CARTON_INVENTORY.sql` - Database migration

---

**Last Updated:** 2026-01-06

