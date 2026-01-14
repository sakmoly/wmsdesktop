# Where to Test Carton-Level Inventory

## 🎯 Testing Locations

### 1. **Item Location Breakdown** (Main Testing Location) ✅

**How to Access:**
1. Go to **Items** menu
2. Select any item from the list
3. Click **"Show Location Breakdown"** button
4. The window will show item inventory by location

**What You'll See:**
- **Bin Level Mode:** Shows item inventory by bin location (existing behavior)
- **Carton Level Mode:** Shows item inventory by **Carton ID + Bin Location**
  - Each row shows: Location, Zone, Aisle, Rack, Level, Bin, **Carton ID**, Quantity
  - The **Carton ID** column only appears when carton mode is enabled

**To Test:**
1. Switch to **Carton Level Inventory** in Settings
2. Go to Items → Select an item → Click "Show Location Breakdown"
3. You should see the **Carton ID** column
4. Each row represents one carton containing that item

---

### 2. **Putaway Task Detail** 

**How to Access:**
1. Go to **Putaway Tasks**
2. Open any putaway task
3. Select a line with a Carton ID

**What You'll See:**
- **Carton Details Panel** (right side) shows:
  - Current Bin of the carton
  - Carton Status
  - Items in the carton

**To Test:**
1. Ensure carton mode is enabled
2. Open a putaway task that has carton IDs
3. Select a line → Carton details appear on the right

---

### 3. **Material Request (Picking) Detail**

**How to Access:**
1. Go to **Material Requests**
2. Open any material request
3. Select an item line
4. Enter source bin location

**What You'll See:**
- **Available Cartons Panel** (right side) shows:
  - List of cartons containing the item in that bin
  - Available quantity per carton

**To Test:**
1. Ensure carton mode is enabled
2. Open a material request
3. Select an item → Enter bin → See available cartons

---

### 4. **Cycle Count Task Detail**

**How to Access:**
1. Go to **Cycle Count Tasks**
2. Open any cycle count task
3. Select a line with bin location
4. Click **"Load Expected Cartons"**

**What You'll See:**
- **Expected Cartons Panel** (right side) shows:
  - List of cartons expected in that bin
  - Item code and expected quantity per carton

**To Test:**
1. Ensure carton mode is enabled
2. Open a cycle count task
3. Select a bin location line → Click "Load Expected Cartons"

---

## 🔧 Setup Required Before Testing

### Step 1: Run Database Migration
```sql
SOURCE MIGRATION_005_BIN_CARTON_INVENTORY.sql;
```

### Step 2: Enable Carton Mode
1. Open **Settings**
2. Find **"Inventory Tracking Mode"**
3. Select **"CartonLevel"**
4. Click **"Save Settings"**

### Step 3: Create Test Data
You need carton data in the database:
- Cartons in `tabCarton` table
- Carton stock in `tabCartonStock` table
- Carton items in `tabCartonItem` table

**How to Create Test Data:**
- Complete a putaway task (cartons are created automatically)
- Or manually insert test data into the tables

---

## 📊 What Data to Look For

### In Item Location Breakdown:
- **Carton ID column** appears (only in carton mode)
- Each row = one carton containing the item
- Same item can appear multiple times (different cartons)
- Shows bin location where each carton is stored

### Example Output:
```
Location ID | Zone | Aisle | Rack | Level | Bin | Carton ID | Qty
------------|------|-------|------|-------|-----|-----------|----
BIN-001     | Zone1| A1    | R01  | L1    | B1  | CARTON-001| 10
BIN-001     | Zone1| A1    | R01  | L1    | B1  | CARTON-002| 15
BIN-002     | Zone1| A1    | R01  | L2    | B2  | CARTON-003| 20
```

---

## ✅ Success Criteria

### Item Location Breakdown Test:
- [ ] Carton ID column appears when carton mode is enabled
- [ ] Carton ID column is hidden when bin mode is enabled
- [ ] Each carton shows as a separate row
- [ ] Bin location is correct for each carton
- [ ] Quantities are correct
- [ ] Total quantity matches sum of all cartons

### Putaway Test:
- [ ] Carton details panel appears when line selected
- [ ] Shows correct current bin
- [ ] Shows carton status
- [ ] Shows items in carton

### Picking Test:
- [ ] Available cartons panel appears
- [ ] Shows cartons in the entered bin
- [ ] Shows correct available quantities

### Cycle Count Test:
- [ ] Expected cartons panel appears
- [ ] Loads cartons for selected bin
- [ ] Shows correct expected quantities

---

## 🐛 Troubleshooting

### "No cartons found" or empty list:
1. Check if carton mode is enabled in Settings
2. Verify migration script ran successfully
3. Check if carton data exists in database:
   ```sql
   SELECT * FROM tabCartonStock WHERE item_code = 'YOUR_ITEM_CODE';
   ```

### Carton ID column not showing:
1. Verify carton mode is enabled
2. Check XAML converter is registered
3. Rebuild the project

### Wrong quantities:
1. Check `tabCartonStock` table for correct quantities
2. Verify carton status is "PUTAWAY" (not PICKED/SHIPPED)
3. Check warehouse matches

---

## 📝 Notes

- **Item Location Breakdown** is the **primary location** to test carton-level inventory
- It shows the complete inventory breakdown by carton
- Other screens (Putaway, Picking, Cycle Count) show carton details in context
- All screens automatically detect the inventory mode setting

---

**Last Updated:** 2026-01-06

