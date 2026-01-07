# ASN and Transfer Order Relationship

## 📋 Overview

**ASN (Advance Shipping Notice)** and **Transfer Order (TO)** are related but serve different purposes in the warehouse workflow.

---

## 🔗 Database Relationship

### Schema Structure

```sql
-- ASN Table
tabAdvanceShippingNotice
  ├── title (PRIMARY KEY) - e.g., "ASN-0002"
  ├── purchase_order
  ├── supplier
  ├── shipment_date
  └── expected_arrival_date

-- Transfer Order Table
tabTransferOrder
  ├── title (PRIMARY KEY) - e.g., "TO-0002"
  ├── advance_shipping_notice (NOT NULL) ← References ASN
  ├── from_warehouse
  ├── prepared_by
  └── required_date
```

### Relationship Type

**One ASN → Multiple Transfer Orders** (One-to-Many)

- ✅ **One ASN can have multiple Transfer Orders**
- ✅ **Each Transfer Order must have exactly one ASN** (required field)
- ✅ **Transfer Order is optional for ASN** (ASN can exist without TO)

---

## 🎯 Business Purpose

### ASN (Advance Shipping Notice)
**Purpose:** Incoming shipment from supplier

- **What it represents:** Items being shipped TO the warehouse FROM a supplier
- **Direction:** Supplier → Warehouse (Inbound)
- **Contains:** What items are coming, quantities, cartons, expected arrival date
- **Example:** 
  - ASN-0002: 1000 units of Jeans from Supplier ABC arriving on Dec 30

### Transfer Order (TO)
**Purpose:** Distribution plan from warehouse to stores

- **What it represents:** Items being transferred FROM the warehouse TO stores
- **Direction:** Warehouse → Stores (Outbound)
- **Contains:** Which items go to which stores, allocated quantities
- **Example:**
  - TO-0002: Allocate 400 units from ASN-0002 to STORE-001, STORE-002, STORE-003

---

## 🔄 Workflow Relationship

### Typical Flow

```
1. Supplier sends ASN
   └── ASN-0002 created
       ├── Item A: 500 units
       ├── Item B: 300 units
       └── Item C: 200 units

2. Warehouse receives ASN
   └── ASN-0002 status: "Submitted"

3. Warehouse creates Transfer Order(s) based on ASN
   └── TO-0002 created (linked to ASN-0002)
       ├── STORE-001: Item A (200 units), Item B (100 units)
       ├── STORE-002: Item A (200 units), Item C (100 units)
       └── STORE-003: Item A (100 units), Item B (200 units), Item C (100 units)

4. Items arrive at warehouse
   └── ASN-0002 status: "Receiving"
       └── Inbound Session created with ASN-0002 and TO-0002

5. Items are sorted according to Transfer Order
   └── Sort Boxes created per store (from TO-0002)
       └── Items sorted into boxes based on TO allocation

6. Transfer Cartons created and dispatched
   └── Transfer Cartons linked to TO-0002
       └── Sent to respective stores
```

---

## 📊 Real-World Example

### Scenario: Jeans Shipment

**ASN-0002:**
- **Supplier:** Jeans Manufacturer
- **Items:**
  - SKU-JEANS-001-BLK-32: 200 units
  - SKU-JEANS-001-BLU-32: 200 units
  - SKU-JEANS-001-BLU-34: 200 units
- **Total:** 600 units
- **Arrival Date:** Dec 30, 2025

**TO-0002 (for ASN-0002):**
- **Purpose:** Distribute to 3 stores
- **Allocations:**
  - **STORE-001:**
    - SKU-JEANS-001-BLK-32: 100 units
    - SKU-JEANS-001-BLU-32: 50 units
  - **STORE-002:**
    - SKU-JEANS-001-BLK-32: 50 units
    - SKU-JEANS-001-BLU-34: 100 units
  - **STORE-003:**
    - SKU-JEANS-001-BLU-32: 150 units
    - SKU-JEANS-001-BLU-34: 100 units

**TO-0006 (also for ASN-0002):**
- **Purpose:** Additional allocation to STORE-003
- **Allocations:**
  - **STORE-003:**
    - SKU-JEANS-001-BLK-32: 50 units (remaining)

**Result:** One ASN (ASN-0002) has **two Transfer Orders** (TO-0002 and TO-0006)

---

## 🔍 Key Points

### 1. **ASN is the Source**
- ASN defines **what is coming** from supplier
- ASN is created **before** items arrive
- ASN is **required** for receiving process

### 2. **Transfer Order is the Plan**
- Transfer Order defines **where items go** after receiving
- Transfer Order is created **after or during** ASN processing
- Transfer Order is **optional** - ASN can be received without TO

### 3. **One ASN, Multiple TOs**
- Common scenario: One shipment distributed to multiple stores
- Each TO can target different stores or different timeframes
- Allows flexible distribution planning

### 4. **Inbound Session Links Both**
- Inbound Session references:
  - `asn_no` (required) - What is being received
  - `transfer_order` (optional) - Distribution plan for sorting

---

## 📱 In the System

### Desktop App
- **ASN View:** Shows incoming shipments
- **Transfer Order View:** Shows distribution plans
- **Inbound Session:** Shows receiving sessions with both ASN and TO

### Mobile App
- **Receiving:** Uses ASN to know what to receive
- **Sorting:** Uses Transfer Order to know which items go to which stores
- **Scan Events:** Records both ASN and TO for tracking

### API Endpoints

**Get Transfer Order by ASN:**
```
GET /api/transfer-order/by-asn/ASN-0002
→ Returns TO-0002 (or first TO found for ASN-0002)
```

**Get All Transfer Orders:**
```
GET /api/master/transfer-orders
→ Returns all TOs with their ASN references
```

**Get Inbound Sessions:**
```
GET /api/inbound/sessions
→ Returns sessions with both asn_no and transfer_order
```

---

## 💡 Why This Relationship?

### Business Logic

1. **Separation of Concerns:**
   - ASN = **Inbound** (receiving)
   - TO = **Outbound** (distribution)

2. **Flexibility:**
   - Can receive ASN without knowing distribution plan
   - Can create multiple TOs for same ASN (different stores, different dates)

3. **Tracking:**
   - Track what was received (ASN)
   - Track where it was distributed (TO)
   - Link both in Inbound Session for complete audit trail

---

## ✅ Summary

| Aspect | ASN | Transfer Order |
|--------|-----|----------------|
| **Purpose** | Incoming shipment | Distribution plan |
| **Direction** | Supplier → Warehouse | Warehouse → Stores |
| **Required?** | Yes (for receiving) | Optional (for sorting) |
| **Relationship** | Parent (can exist alone) | Child (must reference ASN) |
| **Multiple?** | One ASN | Can have multiple TOs per ASN |
| **When Created** | Before arrival | During/after receiving |
| **Used For** | Receiving items | Sorting to stores |

**Key Takeaway:** 
- **ASN** = "What is coming?"
- **Transfer Order** = "Where does it go?"

Both work together to manage the complete inbound-to-outbound flow!

