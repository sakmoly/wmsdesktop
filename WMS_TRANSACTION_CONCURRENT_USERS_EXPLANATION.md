# WMS Transaction - Concurrent Users Explanation

## What Are Concurrent Users?

**Concurrent Users** shows all warehouse operators (users) who are **currently working on the same WMS Transaction** at the same time.

## Purpose

### 1. **Track Who Is Working on What** 👥
Shows which operators have been assigned items in this transaction.

### 2. **Monitor Individual Progress** 📊
For each user, shows:
- **Assigned Items**: How many items they're responsible for
- **Completed Items**: How many items they've finished
- **Status**: Whether they're actively working (Active, Paused, Signed Out)

### 3. **Workload Distribution** ⚖️
Helps managers see if work is evenly distributed among operators.

### 4. **Parallel Processing** 🔄
Allows multiple operators to work on the same transaction simultaneously, speeding up completion.

## How It Works

### Data Source
Concurrent Users are **automatically calculated** from the **Item Details** table:

```csharp
// Groups items by AssignedOperator
var userGroups = transactionDetails
    .Where(d => !string.IsNullOrEmpty(d.AssignedOperator))
    .GroupBy(d => d.AssignedOperator)
    .Select(g => new WmsActiveUser
    {
        User = g.Key,                           // Operator name
        AssignedItemsCount = g.Count(),         // Total items assigned to this user
        CompletedItemsCount = g.Count(d => d.AssignmentStatus == "Done"),  // Items completed
        Status = "Active"                       // Current status
    });
```

### Example Scenario

**Transaction:** WMS-TRANS-0001 (Receiving)
- **Total Items:** 6 items
- **Items Assigned:**
  - 3 items → Assigned to "USER-4"
  - 2 items → Assigned to "USER-5"
  - 1 item → Assigned to "USER-6"

**Concurrent Users Table Shows:**
| User | Assigned Items | Completed Items | Status |
|------|---------------|-----------------|--------|
| USER-4 | 3 | 1 | Active |
| USER-5 | 2 | 0 | Active |
| USER-6 | 1 | 1 | Active |

## When Concurrent Users Appears

### ✅ **Shows Users When:**
- Items in the transaction have `AssignedOperator` filled in
- At least one item has an operator assigned

### ❌ **Empty When:**
- All items have `AssignmentStatus = "Pending"`
- No items have `AssignedOperator` set
- Transaction is just created and not yet assigned

## Real-World Use Cases

### Use Case 1: Receiving Operation
**Scenario:** Large shipment arrives with 20 cartons

**Workflow:**
1. Manager creates Receiving Transaction
2. Manager assigns items to multiple operators:
   - USER-4: Cartons 1-7
   - USER-5: Cartons 8-14
   - USER-6: Cartons 15-20
3. All operators work simultaneously
4. Concurrent Users table shows:
   - USER-4: 7 assigned, 5 completed
   - USER-5: 7 assigned, 3 completed
   - USER-6: 6 assigned, 6 completed ✅

**Benefit:** Faster receiving, parallel processing

### Use Case 2: Picking Operation
**Scenario:** Large Transfer Order with 50 items

**Workflow:**
1. Picking Transaction created
2. Items distributed among pickers:
   - PICKER-1: Items from Zone A (15 items)
   - PICKER-2: Items from Zone B (20 items)
   - PICKER-3: Items from Zone C (15 items)
3. Concurrent Users shows progress per picker

**Benefit:** Efficient picking, zone-based distribution

### Use Case 3: Putaway Operation
**Scenario:** Received items need to be put away to different zones

**Workflow:**
1. Putaway Transaction created
2. Items assigned based on target zones:
   - PUTAWAY-1: Items going to Zone 1
   - PUTAWAY-2: Items going to Zone 2
3. Both operators work simultaneously

**Benefit:** Faster putaway, organized by destination

## Fields Explained

### User
- **What:** Operator/User ID who is working on items
- **Example:** "USER-4", "john.doe", "PICKER-1"

### Assigned Items
- **What:** Total number of items assigned to this user in this transaction
- **Example:** If USER-4 has 3 items with `AssignedOperator = "USER-4"`, this shows 3

### Completed Items
- **What:** Number of items this user has completed (where `AssignmentStatus = "Done"`)
- **Example:** If USER-4 completed 2 out of 3 assigned items, this shows 2

### Status
- **What:** Current working status of the user
- **Values:**
  - `"Active"` - Currently working
  - `"Paused"` - Temporarily stopped
  - `"Signed Out"` - No longer working

## How It's Different from "Assigned To"

| Field | Purpose | Scope |
|-------|---------|-------|
| **Assigned To** | Primary person responsible for the entire transaction | Transaction level (one person) |
| **Concurrent Users** | All operators working on items in the transaction | Item level (multiple people) |

**Example:**
- **Assigned To:** "USER-4" (transaction owner/manager)
- **Concurrent Users:** 
  - USER-4 (working on 3 items)
  - USER-5 (working on 2 items)
  - USER-6 (working on 1 item)

## Current State in Your Screenshot

In your screenshot, the **Concurrent Users** table is **empty** because:
- All items have `AssignmentStatus = "Pending"`
- No items have `AssignedOperator` set yet
- The transaction is newly created and not yet assigned to operators

**Once items are assigned:**
1. Items get `AssignedOperator` filled (e.g., "USER-4")
2. `AssignmentStatus` changes from "Pending" to "Assigned" or "In Progress"
3. Concurrent Users table will automatically populate showing:
   - Which users are working
   - How many items each has
   - How many each has completed

## Summary

**Concurrent Users = Team View of Who's Working on This Transaction**

- Shows all operators assigned to items in the transaction
- Tracks individual progress per operator
- Enables parallel processing (multiple people working simultaneously)
- Helps with workload distribution and monitoring
- Automatically calculated from item assignments
- Empty when no items are assigned yet

**Think of it as:** A team dashboard showing who's doing what and how much progress each person has made on their assigned items.

