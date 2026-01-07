# WMS Concepts Clarification

## 📦 1. Sort Boxes → Transfer Cartons

### ✅ You're Correct!

**Sort Boxes** and **Transfer Cartons** can be the same physical box, or multiple Sort Boxes can go into one Transfer Carton.

### How It Works:

```
Sort Box (BOX-STORE-001-001)
  ├── Item A: 50 units
  ├── Item B: 30 units
  └── Item C: 20 units

Transfer Carton (TC-0001)
  ├── Contains: BOX-STORE-001-001 (entire box)
  └── Can also contain: BOX-STORE-001-002, BOX-STORE-001-003, etc.
```

### Database Relationship:

- **Sort Box** (`tabSortBox`): Created during sorting phase
  - `box_id`: "BOX-STORE-001-001"
  - `store`: "STORE-001"
  - `status`: Open → Filling → Closed

- **Transfer Carton** (`tabTransferCarton`): Created when packing
  - `tc_id`: "TC-0001"
  - Can reference multiple boxes via `box_id` in scan events
  - `status`: Created → Filling → Sealed → Dispatched

### Scan Events:

- **SORT_TO_BOX**: Items sorted into boxes
  - `box_id`: "BOX-STORE-001-001"
  - `item_code`: "SKU-001"
  - `qty`: 50

- **PACK_BOX_TO_TC**: Boxes packed into transfer carton
  - `box_id`: "BOX-STORE-001-001"
  - `tc_id`: "TC-0001"
  - `item_code`: "SKU-001" (auto-expanded from box contents)
  - `qty`: 50

### ✅ This is Correct - Multiple boxes can go to one Transfer Carton!

---

## 📋 2. Distribution Plans vs Transfer Orders

### ⚠️ **Distribution Plans are NOT in the Database!**

**Distribution Plans** (`DistributionPlan` model) appear to be a **UI-only concept** in the desktop app. They are **NOT stored in the database**.

### Comparison:

| Aspect | Transfer Order | Distribution Plan |
|--------|----------------|-------------------|
| **Database Table** | ✅ `tabTransferOrder` | ❌ No table (UI only) |
| **Purpose** | Distribution plan from warehouse to stores | Appears to be UI mockup/placeholder |
| **Used By** | ✅ Mobile app, Backend API | ❌ Desktop app UI only |
| **Real Data** | ✅ Yes - synced from ERPNext | ❌ No - just mock data |
| **ASN Link** | ✅ `advance_shipping_notice` field | ❌ No database link |

### What You Should Use:

**✅ Use Transfer Orders** - They are:
- Stored in database (`tabTransferOrder`, `tabTransferOrderItem`)
- Synced from ERPNext
- Used by mobile app for sorting
- Linked to ASN via `advance_shipping_notice`

**❌ Ignore Distribution Plans** - They are:
- Just UI mock data in `DistributionPlanListViewModel.cs`
- Not connected to database
- Not used by mobile app
- Duplicate concept of Transfer Orders

### Recommendation:

**Remove or Hide Distribution Plans** - They're confusing and duplicate Transfer Orders. Use Transfer Orders instead.

---

## 🔄 3. WMS Transactions - When and Where They Help

### What Are WMS Transactions?

**WMS Transactions** are **operational task records** that track warehouse operations at a detailed level.

### Database Tables:

- `tabWmsTransaction` - Transaction header
- `tabWmsTransactionDetail` - Individual items/lines in the transaction

### When Are They Created?

WMS Transactions are **automatically created** from other WMS activities:

#### 1. **Receiving Transaction**
**Created From:** Inbound Session (ASN receiving)

**When:** Automatically created when ASN is received
- **Source:** `tabInboundSession` + `tabAsnItemDetails`
- **Operation Type:** `Receiving`
- **Reference:** ASN number (e.g., "ASN-0002")

**Purpose:**
- Track receiving operations
- Assign items to operators
- Track completion progress
- **Send to ERPNext** as Material Receipt when completed

**Example:**
```
Transaction: REC-ASN0002-20251227
Operation: Receiving
Reference: ASN-0002
Items:
  - SKU-JEANS-021-BLU-32: 200 units
  - SKU-JEANS-021-BLU-34: 100 units
Status: In Progress → Completed
```

#### 2. **Putaway Transaction**
**Created From:** Putaway Tasks

**When:** Automatically created for items that need putaway
- **Source:** `tabPutawayTask` + `tabPutawayLine`
- **Operation Type:** `Putaway`
- **Reference:** Putaway Task title

**Purpose:**
- Track putaway operations (moving items from dock to storage bins)
- Assign bins to operators
- Track completion progress
- **Send to ERPNext** as Material Transfer when completed

**Example:**
```
Transaction: PUT-TASK001-20251227
Operation: Putaway
Reference: PUTAWAY-TASK-001
Items:
  - SKU-JEANS-021-BLU-32: 50 units → RACK-A-01-BIN-05
  - SKU-SHIRT-001-WHT-L: 20 units → RACK-B-02-BIN-10
Status: In Progress → Completed
```

#### 3. **Picking Transaction**
**Created From:** Transfer Orders

**When:** Automatically created when Transfer Order is ready for picking
- **Source:** `tabTransferOrder` + `tabTransferOrderItem`
- **Operation Type:** `Picking`
- **Reference:** Transfer Order title (e.g., "TO-0002")

**Purpose:**
- Track picking operations (picking items from storage for dispatch)
- Assign items to operators
- Track completion progress
- **Send to ERPNext** as Material Transfer when completed (optional)

**Example:**
```
Transaction: PICK-TO0002-20251227
Operation: Picking
Reference: TO-0002
Items:
  - SKU-JEANS-021-BLU-32: 200 units (from RACK-A-01-BIN-05)
  - SKU-SHIRT-001-WHT-L: 40 units (from RACK-B-02-BIN-10)
Status: In Progress → Completed
```

#### 4. **Cycle Count Transaction**
**Created From:** Cycle Count tasks

**When:** Created for inventory counting operations
- **Operation Type:** `CycleCount`
- **Purpose:** Track inventory counting and adjustments

---

## 🎯 How WMS Transactions Help

### 1. **Operational Task Management**
- Break down large operations (Receiving, Putaway, Picking) into manageable tasks
- Assign specific items to specific operators
- Track progress item-by-item

### 2. **Concurrent User Tracking**
- See which operators are working on the same transaction
- Track individual progress (who completed what)
- Enable parallel processing (multiple operators on same transaction)

### 3. **Progress Tracking**
- `completion_progress`: Percentage of items completed
- `transaction_status`: Draft → In Progress → Partial → Completed
- `assignment_status` per item: Pending → Assigned → In Progress → Done

### 4. **ERPNext Integration**
- When transaction is **Completed**, send to ERPNext as Stock Entry
- **Receiving** → Material Receipt (inventory increase)
- **Putaway** → Material Transfer (bin location update)
- **Picking** → Material Transfer (optional, for staging)

### 5. **Audit Trail**
- Complete record of who did what, when
- Track all item movements
- Reference documents (ASN, TO, Putaway Task)

---

## 📊 Complete Workflow Example

### Scenario: Receive ASN-0002 and Distribute via TO-0002

```
1. ASN-0002 Arrives
   └── Inbound Session Created: SESSION-ASN0002-DEVICE4-USER4
       └── Transfer Order: TO-0002

2. Receiving Phase
   └── WMS Transaction Created: REC-ASN0002-20251227
       ├── Operation: Receiving
       ├── Reference: ASN-0002
       ├── Items: All items from ASN-0002
       └── Status: In Progress → Completed
           └── ✅ Send to ERPNext: Material Receipt

3. Sorting Phase
   └── Sort Boxes Created: BOX-STORE-001-001, BOX-STORE-003-001
       ├── SORT_TO_BOX events created
       └── Items sorted according to TO-0002 allocations

4. Packing Phase
   └── Transfer Cartons Created: TC-0001, TC-0002
       ├── PACK_BOX_TO_TC events created
       └── Boxes packed into transfer cartons

5. Putaway Phase (for remaining items)
   └── WMS Transaction Created: PUT-TASK001-20251227
       ├── Operation: Putaway
       ├── Items: Items not sorted to stores
       └── Status: In Progress → Completed
           └── ✅ Send to ERPNext: Material Transfer

6. Picking Phase (if needed)
   └── WMS Transaction Created: PICK-TO0002-20251227
       ├── Operation: Picking
       ├── Reference: TO-0002
       ├── Items: Items to be picked from storage
       └── Status: In Progress → Completed
           └── ⚠️ Send to ERPNext: Material Transfer (optional)
```

---

## ✅ Summary

### 1. Sort Boxes → Transfer Cartons
- ✅ **Correct** - Multiple boxes can go to one Transfer Carton
- ✅ This transaction should be sent to ERPNext as Stock Entry

### 2. Distribution Plans vs Transfer Orders
- ❌ **Distribution Plans are NOT real** - They're UI-only mock data
- ✅ **Use Transfer Orders** - They're in the database and used by mobile app
- 💡 **Recommendation:** Remove/hide Distribution Plans to avoid confusion

### 3. WMS Transactions
- ✅ **Automatically created** from ASN, Putaway Tasks, Transfer Orders
- ✅ **Help with:**
  - Task management (assign items to operators)
  - Progress tracking (completion percentage)
  - Concurrent user tracking (multiple operators)
  - ERPNext integration (send as Stock Entry when completed)
  - Audit trail (who did what, when)

### When to Use WMS Transactions:

| Operation | WMS Transaction | ERPNext Stock Entry |
|-----------|----------------|---------------------|
| **Receiving** | ✅ Auto-created from ASN | ✅ Material Receipt (when completed) |
| **Putaway** | ✅ Auto-created from Putaway Task | ✅ Material Transfer (when completed) |
| **Picking** | ✅ Auto-created from TO | ⚠️ Material Transfer (optional, when completed) |
| **Cycle Count** | ✅ Created for counting | ⚠️ Only if discrepancy exists |

---

## 🎯 Key Takeaways

1. **Sort Boxes → Transfer Cartons**: ✅ Correct - multiple boxes to one carton
2. **Distribution Plans**: ❌ Ignore - use Transfer Orders instead
3. **WMS Transactions**: ✅ Use for operational task management and ERPNext sync

