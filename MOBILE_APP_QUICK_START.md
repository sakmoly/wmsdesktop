# Mobile App Quick Start Guide

## 🚀 Quick Reference for New Features Implementation

---

## 📋 What You Need to Implement

### 🆕 NEW Features (4 Modules)

1. **Transfer In** - Showroom → Warehouse receiving
2. **Material Request** - Warehouse → Showroom picking
3. **Cycle Count** - Physical inventory count
4. **Stock Ledger** - Real-time stock viewing

---

## 🎯 Implementation Steps (In Order)

### Step 1: API Integration (Day 1)

**File to Update:** `api/client.js` (or your API client)

```javascript
// Add these new API methods:

// Transfer In
POST   /api/transfer-in              // Create Transfer In
GET    /api/transfer-in              // Get list
GET    /api/transfer-in/:title       // Get single

// Material Request
POST   /api/material-requests       // Create Material Request
GET    /api/material-requests      // Get list
GET    /api/material-requests/:title // Get single

// Cycle Count
POST   /api/cycle-count              // Create Cycle Count Task
GET    /api/cycle-count              // Get list
GET    /api/cycle-count/:title      // Get single

// Stock Ledger
GET    /api/stock-ledger             // Get all stock
GET    /api/stock-ledger/:item/:warehouse // Get stock by item/warehouse
GET    /api/stock-transactions       // Get transaction history
```

**Time Estimate:** 2-3 hours

---

### Step 2: Create Data Models (Day 1)

**Files to Create:**

- `models/TransferIn.js`
- `models/MaterialRequest.js`
- `models/CycleCount.js`
- `models/StockLedger.js`

**Time Estimate:** 1-2 hours

---

### Step 3: Transfer In Screens (Day 2-3)

**Screens to Create:**

1. **Transfer In List Screen**

   - Show list of Transfer In documents
   - Filter by status, showroom, warehouse
   - Pull to refresh
   - Navigate to detail

2. **Transfer In Detail Screen**

   - Show Transfer In information
   - Show items list
   - Show receiving status

3. **Transfer In Form Screen** (Optional - if creating from mobile)
   - Form to create new Transfer In
   - Item selection
   - Validation

**Time Estimate:** 4-6 hours

---

### Step 4: Update Receiving Screen (Day 3)

**File to Update:** `screens/ReceivingScreen.js`

**Changes Needed:**

1. Add source type selector (ASN or Transfer In)
2. Add Transfer In selection dropdown
3. Update `createInboundSession` to use `transfer_in` parameter when Transfer In is selected

**Code Change:**

```javascript
// Before (ASN only):
{
  inbound_session: "...",
  asn_no: "ASN-0001",
  ...
}

// After (Support both):
{
  inbound_session: "...",
  asn_no: selectedASN || null,        // For ASN
  transfer_in: selectedTransferIn || null,  // NEW: For Transfer In
  ...
}
```

**Time Estimate:** 2-3 hours

---

### Step 5: Material Request Screens (Day 4-5)

**Screens to Create:**

1. **Material Request List Screen**

   - Show list of Material Requests
   - Filter by status, warehouse, showroom
   - Show progress (picked qty / requested qty)

2. **Material Request Detail Screen**

   - Show Material Request info
   - Show items with requested vs picked qty
   - Navigate to picking

3. **Material Request Form Screen** (Optional)
   - Create new Material Request
   - Add items with requested quantities

**Time Estimate:** 4-6 hours

**Note:** Picking workflow uses existing picking screens, just reference Material Request document.

---

### Step 6: Cycle Count Screens (Day 6-7)

**Screens to Create:**

1. **Cycle Count List Screen**

   - Show list of Cycle Count Tasks
   - Filter by status, warehouse, zone
   - Show progress (counted / total items)
   - Show discrepancy count

2. **Cycle Count Detail Screen**

   - Show Cycle Count Task info
   - List items to count
   - Show expected vs actual qty
   - Navigate to counting screen

3. **Cycle Count Counting Screen** ⭐ **Most Important**

   - Display item to count
   - Show expected quantity
   - Input actual quantity
   - Calculate discrepancy
   - Record count
   - Navigate to next item

4. **Cycle Count Form Screen** (Optional)
   - Create new Cycle Count Task
   - Select warehouse, zone
   - Add items to count

**Time Estimate:** 6-8 hours

---

### Step 7: Stock Ledger Screens (Day 8)

**Screens to Create:**

1. **Stock Ledger List Screen**

   - Show all stock entries
   - Filter by warehouse, item, bin
   - Search by item code
   - Show qty, reserved, available

2. **Stock Detail Screen**

   - Show stock breakdown by bin
   - Show totals (qty, reserved, available)
   - Link to transaction history

3. **Stock Transaction History Screen**
   - Show all stock movements
   - Filter by date, type, item
   - Show qty changes (before/after)

**Time Estimate:** 4-6 hours

---

### Step 8: Update Existing Screens (Day 9)

**Files to Update:**

1. **Inbound Session List Screen**

   - Display `transfer_in` field if present
   - Show source type (ASN or Transfer In)

2. **Item Detail Screen**
   - Add stock information section
   - Show current stock qty
   - Link to stock detail

**Time Estimate:** 2-3 hours

---

### Step 9: Navigation & Menu (Day 9)

**File to Update:** `navigation/AppNavigator.js`

**Add Routes:**

```javascript
// Transfer In
<Stack.Screen name="TransferInList" component={TransferInListScreen} />
<Stack.Screen name="TransferInDetail" component={TransferInDetailScreen} />
<Stack.Screen name="TransferInForm" component={TransferInFormScreen} />

// Material Request
<Stack.Screen name="MaterialRequestList" component={MaterialRequestListScreen} />
<Stack.Screen name="MaterialRequestDetail" component={MaterialRequestDetailScreen} />
<Stack.Screen name="MaterialRequestForm" component={MaterialRequestFormScreen} />

// Cycle Count
<Stack.Screen name="CycleCountList" component={CycleCountListScreen} />
<Stack.Screen name="CycleCountDetail" component={CycleCountDetailScreen} />
<Stack.Screen name="CycleCountCounting" component={CycleCountCountingScreen} />
<Stack.Screen name="CycleCountForm" component={CycleCountFormScreen} />

// Stock Ledger
<Stack.Screen name="StockLedgerList" component={StockLedgerListScreen} />
<Stack.Screen name="StockDetail" component={StockDetailScreen} />
<Stack.Screen name="StockTransactions" component={StockTransactionHistoryScreen} />
```

**File to Update:** `components/MainMenu.js`

**Add Menu Items:**

```javascript
<MenuItem title="Transfer In" icon="arrow-down" onPress={() => navigate('TransferInList')} />
<MenuItem title="Material Request" icon="arrow-up" onPress={() => navigate('MaterialRequestList')} />
<MenuItem title="Cycle Count" icon="clipboard-check" onPress={() => navigate('CycleCountList')} />
<MenuItem title="Stock Ledger" icon="database" onPress={() => navigate('StockLedgerList')} />
```

**Time Estimate:** 1-2 hours

---

### Step 10: Testing (Day 10)

**Test Each Workflow:**

1. **Transfer In:**

   - Create Transfer In
   - Create inbound session with transfer_in
   - Receive items
   - Verify stock increases

2. **Material Request:**

   - Create Material Request
   - Pick items
   - Verify stock decreases

3. **Cycle Count:**

   - Create Cycle Count Task
   - Record counts
   - Verify discrepancies
   - Approve and verify stock adjustment

4. **Stock Ledger:**
   - View stock list
   - View stock by item
   - View transaction history
   - Verify real-time updates

**Time Estimate:** 4-6 hours

---

## 📱 Screen Implementation Checklist

### Transfer In Module

- [ ] Transfer In List Screen
- [ ] Transfer In Detail Screen
- [ ] Transfer In Form Screen (optional)
- [ ] Update Receiving Screen (support transfer_in)

### Material Request Module

- [ ] Material Request List Screen
- [ ] Material Request Detail Screen
- [ ] Material Request Form Screen (optional)
- [ ] Integrate with existing Picking Screen

### Cycle Count Module

- [ ] Cycle Count List Screen
- [ ] Cycle Count Detail Screen
- [ ] Cycle Count Counting Screen ⭐
- [ ] Cycle Count Form Screen (optional)

### Stock Ledger Module

- [ ] Stock Ledger List Screen
- [ ] Stock Detail Screen
- [ ] Stock Transaction History Screen
- [ ] Update Item Detail Screen (add stock info)

---

## 🔑 Key Implementation Points

### 1. Transfer In Receiving

**Important:** When receiving Transfer In items:

- Use `transfer_in` parameter instead of `asn_no`
- Rest of the flow is the same (receive lines, complete session)
- Items automatically go to Putaway (no Sorting step)

**API Call:**

```javascript
POST /api/inbound/update
{
  "inbound_session": "SESSION-TI0001-...",
  "transfer_in": "TI-0001",  // ← Use this instead of asn_no
  "status": "Active",
  "dock": "DOCK-01",
  "user_id": "USER-001",
  "device_id": "DEVICE-001"
}
```

### 2. Material Request Picking

**Important:** Material Request uses existing picking workflow:

- Get Material Request details
- Use existing picking screen
- Reference Material Request in picking transaction
- Stock decreases automatically when picking completed

### 3. Cycle Count Counting

**Important:** The counting screen is the core feature:

- Display one item at a time
- Show expected qty from stock ledger
- Input actual qty
- Calculate discrepancy automatically
- Record and move to next item

**Flow:**

```
Select Cycle Count Task →
  View Items List →
    Tap Item →
      Counting Screen →
        Enter Actual Qty →
          Record →
            Next Item
```

### 4. Stock Ledger

**Important:** Stock is updated automatically:

- No manual updates needed
- Stock updates after each transaction (receiving, putaway, picking, cycle count)
- View real-time stock anytime
- Transaction history provides audit trail

---

## 🎨 UI Components Needed

### Reusable Components to Create:

1. **FilterBar Component**

   - Status filter dropdown
   - Warehouse/Showroom filter
   - Date range picker
   - Apply/Clear buttons

2. **StatusBadge Component**

   - Color-coded status display
   - Draft (Gray), Active (Blue), Completed (Green), etc.

3. **ItemRow Component**

   - Display item with qty
   - Used in multiple screens

4. **QtyInput Component**

   - Numeric input with validation
   - Used in Cycle Count, forms

5. **StockCard Component**
   - Display stock information
   - Qty, Reserved, Available
   - Used in Stock screens

---

## 📊 Data Flow Diagrams

### Transfer In Flow

```
Create Transfer In →
  Submit →
    Create Inbound Session (with transfer_in) →
      Receive Items →
        Complete Session →
          Putaway Task Created →
            Stock Increases
```

### Material Request Flow

```
Create Material Request →
  Submit →
    Pick Items (existing picking) →
      Complete Picking →
        Stock Decreases
```

### Cycle Count Flow

```
Create Cycle Count Task →
  Assign Items →
    Count Items (one by one) →
      Record Actual Qty →
        Review Discrepancies →
          Approve →
            Stock Adjusted
```

---

## 🧪 Testing Scenarios

### Scenario 1: Transfer In Complete Flow

1. Create Transfer In (TI-0001) with 2 items
2. Create inbound session with `transfer_in: "TI-0001"`
3. Receive both items
4. Complete session
5. Verify stock increased at warehouse level
6. Verify putaway task created
7. Complete putaway
8. Verify stock moved to bin location

### Scenario 2: Material Request Complete Flow

1. Create Material Request (MR-0001) for 2 items
2. Pick items using existing picking screen
3. Complete picking
4. Verify stock decreased from source bins
5. Verify Material Request shows picked qty

### Scenario 3: Cycle Count Complete Flow

1. Create Cycle Count Task (CC-0001) with 3 items
2. Count first item: Expected 50, Actual 48 (discrepancy -2)
3. Count second item: Expected 30, Actual 30 (no discrepancy)
4. Count third item: Expected 20, Actual 22 (discrepancy +2)
5. Review discrepancies
6. Approve adjustments
7. Verify stock updated correctly

### Scenario 4: Stock Ledger Real-Time Updates

1. View stock for ITEM-001 @ WH-MAIN
2. Complete a receiving transaction
3. Refresh stock ledger
4. Verify stock increased
5. View transaction history
6. Verify transaction logged

---

## ⚠️ Common Pitfalls to Avoid

1. **Don't forget to use `transfer_in` instead of `asn_no`** when receiving Transfer In items
2. **Don't create separate picking flow** for Material Request - use existing picking
3. **Don't manually update stock** - it's automatic after transactions
4. **Don't forget to handle null values** for optional fields (bin_location, transfer_in, etc.)
5. **Don't skip validation** - always validate forms before submission
6. **Don't forget error handling** - handle network errors, 401, 404, etc.

---

## 📝 Quick Code Snippets

### API Call Example

```javascript
// Transfer In API Call
const createTransferIn = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/transfer-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to create Transfer In");
    }

    return await response.json();
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};
```

### Form Validation Example

```javascript
const validateTransferIn = (data) => {
  const errors = {};

  if (!data.title) errors.title = "Title is required";
  if (!data.from_showroom) errors.from_showroom = "From Showroom is required";
  if (!data.to_warehouse) errors.to_warehouse = "To Warehouse is required";
  if (!data.transfer_date) errors.transfer_date = "Transfer Date is required";
  if (!data.prepared_by) errors.prepared_by = "Prepared By is required";
  if (!data.items || data.items.length === 0) {
    errors.items = "At least one item is required";
  }

  data.items?.forEach((item, index) => {
    if (!item.item_code) {
      errors[`items.${index}.item_code`] = "Item code is required";
    }
    if (!item.qty || item.qty <= 0) {
      errors[`items.${index}.qty`] = "Quantity must be greater than 0";
    }
  });

  return errors;
};
```

### Loading State Example

```javascript
const [loading, setLoading] = useState(false);

const loadData = async () => {
  setLoading(true);
  try {
    const data = await api.getData();
    setData(data);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
};

// In render:
{
  loading ? <LoadingSpinner /> : <DataList data={data} />;
}
```

---

## 🎯 Priority Implementation Order

### Week 1: Core Features

1. ✅ API Integration
2. ✅ Transfer In (List, Detail, Receiving integration)
3. ✅ Material Request (List, Detail)

### Week 2: Advanced Features

4. ✅ Cycle Count (List, Detail, Counting Screen)
5. ✅ Stock Ledger (List, Detail, Transaction History)

### Week 3: Polish & Testing

6. ✅ UI/UX improvements
7. ✅ Error handling
8. ✅ Testing all workflows

---

## 📞 Support & Reference

- **API Documentation:** See `COMPLETE_WORKFLOW_API_DOCUMENTATION.md`
- **Detailed Guide:** See `MOBILE_APP_IMPLEMENTATION_GUIDE.md`
- **API Base URL:** Configure in your app settings
- **Authentication:** Use Bearer token in headers

---

**Good luck with your mobile app development! 🚀**
