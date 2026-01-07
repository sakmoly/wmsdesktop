# Mobile App Implementation Guide

## Step-by-Step Guide for Implementing New WMS Features

---

## 📱 Overview

This guide provides step-by-step instructions for implementing the new WMS features in your mobile application:

- **Transfer In** (Showroom → Warehouse)
- **Material Request** (Warehouse → Showroom)
- **Cycle Count** (Physical Inventory Count)
- **Stock Ledger** (Real-Time Stock View)

---

## 🎯 Prerequisites

Before starting, ensure you have:

- ✅ Mobile app development environment set up
- ✅ API base URL configured
- ✅ Authentication token management implemented
- ✅ Network service/API client ready
- ✅ Navigation structure in place

---

## 📋 Table of Contents

1. [API Integration Setup](#1-api-integration-setup)
2. [Transfer In Implementation](#2-transfer-in-implementation)
3. [Material Request Implementation](#3-material-request-implementation)
4. [Cycle Count Implementation](#4-cycle-count-implementation)
5. [Stock Ledger Implementation](#5-stock-ledger-implementation)
6. [Updated Existing Features](#6-updated-existing-features)
7. [Testing Checklist](#7-testing-checklist)

---

## 1. API Integration Setup

### Step 1.1: Add New API Endpoints to API Client

**File:** `api/client.js` (or your API client file)

```javascript
// Add these new API endpoints to your API client

// Transfer In APIs
export const transferInAPI = {
  create: (data) => api.post("/api/transfer-in", data),
  getAll: (params) => api.get("/api/transfer-in", { params }),
  getByTitle: (title) => api.get(`/api/transfer-in/${title}`),
};

// Material Request APIs
export const materialRequestAPI = {
  create: (data) => api.post("/api/material-requests", data),
  getAll: (params) => api.get("/api/material-requests", { params }),
  getByTitle: (title) => api.get(`/api/material-requests/${title}`),
};

// Cycle Count APIs
export const cycleCountAPI = {
  create: (data) => api.post("/api/cycle-count", data),
  getAll: (params) => api.get("/api/cycle-count", { params }),
  getByTitle: (title) => api.get(`/api/cycle-count/${title}`),
};

// Stock Ledger APIs
export const stockLedgerAPI = {
  getAll: (params) => api.get("/api/stock-ledger", { params }),
  getByItemWarehouse: (itemCode, warehouse) =>
    api.get(`/api/stock-ledger/${itemCode}/${warehouse}`),
};

// Stock Transaction APIs
export const stockTransactionAPI = {
  getAll: (params) => api.get("/api/stock-transactions", { params }),
};
```

### Step 1.2: Update Inbound API (Support Transfer In)

**File:** `api/inbound.js` (or your inbound API file)

```javascript
// Update the updateInboundSession function to support transfer_in
export const updateInboundSession = (data) => {
  // Now accepts either asn_no OR transfer_in
  // Example:
  // {
  //   inbound_session: "SESSION-001",
  //   asn_no: "ASN-0001",  // For ASN receiving
  //   // OR
  //   transfer_in: "TI-0001",  // For Transfer In receiving
  //   status: "Active",
  //   ...
  // }
  return api.post("/api/inbound/update", data);
};
```

---

## 2. Transfer In Implementation

### Step 2.1: Create Transfer In Data Models

**File:** `models/TransferIn.js` (or your models directory)

```javascript
// Transfer In Model
export class TransferIn {
  constructor(data) {
    this.title = data.title || "";
    this.status = data.status || "Draft";
    this.fromShowroom = data.from_showroom || data.fromShowroom || "";
    this.toWarehouse = data.to_warehouse || data.toWarehouse || "";
    this.transferDate = data.transfer_date || data.transferDate || "";
    this.expectedArrivalDate =
      data.expected_arrival_date || data.expectedArrivalDate || null;
    this.preparedBy = data.prepared_by || data.preparedBy || "";
    this.receivedBy = data.received_by || data.receivedBy || null;
    this.receivedOn = data.received_on || data.receivedOn || null;
    this.totalQty = data.total_qty || data.totalQty || 0;
    this.items = (data.items || []).map((item) => new TransferInItem(item));
    this.createdAt = data.created_at || data.createdAt || null;
    this.updatedAt = data.updated_at || data.updatedAt || null;
  }
}

// Transfer In Item Model
export class TransferInItem {
  constructor(data) {
    this.itemCode = data.item_code || data.itemCode || "";
    this.qty = data.qty || 0;
    this.cartonId = data.carton_id || data.cartonId || null;
    this.receivedQty = data.received_qty || data.receivedQty || 0;
  }
}
```

### Step 2.2: Create Transfer In List Screen

**File:** `screens/TransferInListScreen.js`

**Features:**

- Display list of Transfer In documents
- Filter by status, showroom, warehouse
- Pull to refresh
- Navigate to detail screen

**Implementation Steps:**

```javascript
import React, { useState, useEffect } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { transferInAPI } from "../api/client";
import { TransferIn } from "../models/TransferIn";

export default function TransferInListScreen({ navigation }) {
  const [transferIns, setTransferIns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    status: null,
    from_showroom: null,
    to_warehouse: null,
  });

  // Load Transfer Ins
  const loadTransferIns = async () => {
    try {
      setLoading(true);
      const response = await transferInAPI.getAll(filters);
      const data = response.data.map((item) => new TransferIn(item));
      setTransferIns(data);
    } catch (error) {
      console.error("Error loading Transfer Ins:", error);
      // Show error message to user
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTransferIns();
  }, [filters]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTransferIns();
  };

  const renderItem = ({ item }) => (
    <TransferInListItem
      item={item}
      onPress={() =>
        navigation.navigate("TransferInDetail", { title: item.title })
      }
    />
  );

  return (
    <View>
      <FilterBar filters={filters} onFilterChange={setFilters} />
      <FlatList
        data={transferIns}
        renderItem={renderItem}
        keyExtractor={(item) => item.title}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}
```

### Step 2.3: Create Transfer In Detail Screen

**File:** `screens/TransferInDetailScreen.js`

**Features:**

- Display Transfer In details
- Show items list
- Show receiving status
- Action buttons (if applicable)

**Implementation Steps:**

```javascript
import React, { useState, useEffect } from "react";
import { View, ScrollView, Text } from "react-native";
import { transferInAPI } from "../api/client";
import { TransferIn } from "../models/TransferIn";

export default function TransferInDetailScreen({ route, navigation }) {
  const { title } = route.params;
  const [transferIn, setTransferIn] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransferIn();
  }, [title]);

  const loadTransferIn = async () => {
    try {
      setLoading(true);
      const response = await transferInAPI.getByTitle(title);
      setTransferIn(new TransferIn(response.data));
    } catch (error) {
      console.error("Error loading Transfer In:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!transferIn) return <ErrorMessage message="Transfer In not found" />;

  return (
    <ScrollView>
      <View style={styles.header}>
        <Text style={styles.title}>{transferIn.title}</Text>
        <Text style={styles.status}>{transferIn.status}</Text>
      </View>

      <View style={styles.infoSection}>
        <InfoRow label="From Showroom" value={transferIn.fromShowroom} />
        <InfoRow label="To Warehouse" value={transferIn.toWarehouse} />
        <InfoRow label="Transfer Date" value={transferIn.transferDate} />
        <InfoRow label="Prepared By" value={transferIn.preparedBy} />
        <InfoRow label="Total Qty" value={transferIn.totalQty.toString()} />
      </View>

      <View style={styles.itemsSection}>
        <Text style={styles.sectionTitle}>Items</Text>
        {transferIn.items.map((item, index) => (
          <ItemRow key={index} item={item} />
        ))}
      </View>
    </ScrollView>
  );
}
```

### Step 2.4: Create Transfer In Form Screen

**File:** `screens/TransferInFormScreen.js`

**Features:**

- Form to create new Transfer In
- Item selection/entry
- Validation
- Submit to API

**Implementation Steps:**

```javascript
import React, { useState } from "react";
import { View, ScrollView, Button } from "react-native";
import { transferInAPI } from "../api/client";

export default function TransferInFormScreen({ navigation }) {
  const [formData, setFormData] = useState({
    title: "",
    from_showroom: "",
    to_warehouse: "",
    transfer_date: new Date().toISOString().split("T")[0],
    expected_arrival_date: null,
    prepared_by: "", // Get from current user
    items: [],
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!formData.title) newErrors.title = "Title is required";
    if (!formData.from_showroom)
      newErrors.from_showroom = "From Showroom is required";
    if (!formData.to_warehouse)
      newErrors.to_warehouse = "To Warehouse is required";
    if (!formData.transfer_date)
      newErrors.transfer_date = "Transfer Date is required";
    if (!formData.prepared_by)
      newErrors.prepared_by = "Prepared By is required";
    if (formData.items.length === 0)
      newErrors.items = "At least one item is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      const response = await transferInAPI.create(formData);
      if (response.data.ok) {
        // Show success message
        navigation.goBack();
        // Refresh Transfer In list
      }
    } catch (error) {
      console.error("Error creating Transfer In:", error);
      // Show error message
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_code: "", qty: 0, carton_id: null }],
    });
  };

  return (
    <ScrollView>
      <FormField
        label="Transfer In No."
        value={formData.title}
        onChangeText={(text) => setFormData({ ...formData, title: text })}
        error={errors.title}
      />

      <FormField
        label="From Showroom"
        value={formData.from_showroom}
        onChangeText={(text) =>
          setFormData({ ...formData, from_showroom: text })
        }
        error={errors.from_showroom}
      />

      <FormField
        label="To Warehouse"
        value={formData.to_warehouse}
        onChangeText={(text) =>
          setFormData({ ...formData, to_warehouse: text })
        }
        error={errors.to_warehouse}
      />

      <DatePicker
        label="Transfer Date"
        value={formData.transfer_date}
        onChange={(date) => setFormData({ ...formData, transfer_date: date })}
        error={errors.transfer_date}
      />

      <ItemsList
        items={formData.items}
        onItemsChange={(items) => setFormData({ ...formData, items })}
        error={errors.items}
      />

      <Button title="Add Item" onPress={addItem} />
      <Button title="Create Transfer In" onPress={handleSubmit} />
    </ScrollView>
  );
}
```

### Step 2.5: Update Receiving Screen (Support Transfer In)

**File:** `screens/ReceivingScreen.js` (or your receiving screen)

**Changes Needed:**

```javascript
// Update to support both ASN and Transfer In
const createInboundSession = async (sessionData) => {
  // Check if it's ASN or Transfer In
  if (sessionData.asn_no) {
    // Existing ASN receiving flow
    await inboundAPI.updateInboundSession({
      inbound_session: sessionData.inbound_session,
      asn_no: sessionData.asn_no,
      status: "Active",
      // ... other fields
    });
  } else if (sessionData.transfer_in) {
    // NEW: Transfer In receiving flow
    await inboundAPI.updateInboundSession({
      inbound_session: sessionData.inbound_session,
      transfer_in: sessionData.transfer_in, // Use transfer_in instead of asn_no
      status: "Active",
      // ... other fields
    });
  }
};
```

**Key Changes:**

- Add Transfer In selection option
- Use `transfer_in` parameter instead of `asn_no` when receiving Transfer In
- Rest of the receiving flow remains the same (receive lines, complete session)

### Step 2.6: Add Navigation Routes

**File:** `navigation/AppNavigator.js` (or your navigation file)

```javascript
// Add new routes
<Stack.Screen
  name="TransferInList"
  component={TransferInListScreen}
  options={{ title: 'Transfer In' }}
/>
<Stack.Screen
  name="TransferInDetail"
  component={TransferInDetailScreen}
  options={{ title: 'Transfer In Details' }}
/>
<Stack.Screen
  name="TransferInForm"
  component={TransferInFormScreen}
  options={{ title: 'Create Transfer In' }}
/>
```

### Step 2.7: Add Menu Item

**File:** `components/MainMenu.js` (or your menu component)

```javascript
// Add Transfer In menu item
<MenuItem
  title="Transfer In"
  icon="arrow-down"
  onPress={() => navigation.navigate("TransferInList")}
/>
```

---

## 3. Material Request Implementation

### Step 3.1: Create Material Request Data Models

**File:** `models/MaterialRequest.js`

```javascript
export class MaterialRequest {
  constructor(data) {
    this.title = data.title || "";
    this.status = data.status || "Draft";
    this.fromWarehouse = data.from_warehouse || data.fromWarehouse || "";
    this.toShowroom = data.to_showroom || data.toShowroom || "";
    this.requestDate = data.request_date || data.requestDate || "";
    this.requiredDate = data.required_date || data.requiredDate || null;
    this.requestedBy = data.requested_by || data.requestedBy || "";
    this.totalRequestedQty =
      data.total_requested_qty || data.totalRequestedQty || 0;
    this.totalPickedQty = data.total_picked_qty || data.totalPickedQty || 0;
    this.items = (data.items || []).map(
      (item) => new MaterialRequestItem(item)
    );
    this.createdAt = data.created_at || data.createdAt || null;
    this.updatedAt = data.updated_at || data.updatedAt || null;
  }
}

export class MaterialRequestItem {
  constructor(data) {
    this.itemCode = data.item_code || data.itemCode || "";
    this.requestedQty = data.requested_qty || data.requestedQty || 0;
    this.pickedQty = data.picked_qty || data.pickedQty || 0;
  }
}
```

### Step 3.2: Create Material Request List Screen

**File:** `screens/MaterialRequestListScreen.js`

**Similar structure to Transfer In List Screen:**

```javascript
import React, { useState, useEffect } from "react";
import { View, FlatList } from "react-native";
import { materialRequestAPI } from "../api/client";
import { MaterialRequest } from "../models/MaterialRequest";

export default function MaterialRequestListScreen({ navigation }) {
  const [materialRequests, setMaterialRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: null,
    from_warehouse: null,
    to_showroom: null,
  });

  const loadMaterialRequests = async () => {
    try {
      setLoading(true);
      const response = await materialRequestAPI.getAll(filters);
      const data = response.data.map((item) => new MaterialRequest(item));
      setMaterialRequests(data);
    } catch (error) {
      console.error("Error loading Material Requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterialRequests();
  }, [filters]);

  // Similar implementation to TransferInListScreen
  // ...
}
```

### Step 3.3: Create Material Request Detail Screen

**File:** `screens/MaterialRequestDetailScreen.js`

**Features:**

- Display Material Request details
- Show items with requested vs picked quantities
- Show progress (picked qty / requested qty)
- Navigate to picking screen if needed

### Step 3.4: Create Material Request Form Screen

**File:** `screens/MaterialRequestFormScreen.js`

**Similar to Transfer In Form, but with:**

- `from_warehouse` and `to_showroom` fields
- `request_date` and `required_date`
- Items with `requested_qty` only (no carton_id)

### Step 3.5: Integrate with Picking Workflow

**Note:** Material Request uses the existing picking workflow. When picking items for a Material Request:

1. Get Material Request details
2. Use existing picking screen/flow
3. Reference Material Request title in the picking transaction
4. Stock will automatically decrease when picking is completed

---

## 4. Cycle Count Implementation

### Step 4.1: Create Cycle Count Data Models

**File:** `models/CycleCount.js`

```javascript
export class CycleCountTask {
  constructor(data) {
    this.title = data.title || "";
    this.status = data.status || "Draft";
    this.countType = data.count_type || data.countType || "Cycle";
    this.warehouse = data.warehouse || "";
    this.zone = data.zone || null;
    this.countDate = data.count_date || data.countDate || "";
    this.scheduledStartTime =
      data.scheduled_start_time || data.scheduledStartTime || null;
    this.scheduledEndTime =
      data.scheduled_end_time || data.scheduledEndTime || null;
    this.freezeStock = data.freeze_stock || data.freezeStock || false;
    this.createdBy = data.created_by || data.createdBy || "";
    this.assignedTo = data.assigned_to || data.assignedTo || null;
    this.totalItems = data.total_items || data.totalItems || 0;
    this.countedItems = data.counted_items || data.countedItems || 0;
    this.itemsWithDiscrepancy =
      data.items_with_discrepancy || data.itemsWithDiscrepancy || 0;
    this.lines = (data.lines || []).map((line) => new CycleCountLine(line));
    this.createdAt = data.created_at || data.createdAt || null;
    this.updatedAt = data.updated_at || data.updatedAt || null;
  }
}

export class CycleCountLine {
  constructor(data) {
    this.id = data.id || 0;
    this.itemCode = data.item_code || data.itemCode || "";
    this.binLocation = data.bin_location || data.binLocation || null;
    this.expectedQty = data.expected_qty || data.expectedQty || 0;
    this.actualQty = data.actual_qty || data.actualQty || null;
    this.discrepancy = data.discrepancy || null;
    this.countedBy = data.counted_by || data.countedBy || null;
    this.countedOn = data.counted_on || data.countedOn || null;
    this.status = data.status || "Pending";
    this.approvalRequired =
      data.approval_required || data.approvalRequired || false;
    this.approvedBy = data.approved_by || data.approvedBy || null;
    this.discrepancyReason =
      data.discrepancy_reason || data.discrepancyReason || null;
  }
}
```

### Step 4.2: Create Cycle Count List Screen

**File:** `screens/CycleCountListScreen.js`

**Features:**

- List of Cycle Count Tasks
- Filter by status, warehouse, zone, count type
- Show progress (counted_items / total_items)
- Show discrepancy count

### Step 4.3: Create Cycle Count Detail Screen

**File:** `screens/CycleCountDetailScreen.js`

**Features:**

- Display Cycle Count Task details
- List of items to count
- Show expected qty vs actual qty
- Record actual count
- Highlight discrepancies
- Submit counts

**Key Implementation:**

```javascript
const recordCount = async (lineId, actualQty) => {
  // Update the cycle count line with actual quantity
  // This would typically update via WMS Transaction or direct API call
  // The discrepancy will be calculated automatically

  // Example: Update local state first
  const updatedLines = cycleCountTask.lines.map((line) => {
    if (line.id === lineId) {
      return {
        ...line,
        actual_qty: actualQty,
        discrepancy: actualQty - line.expectedQty,
        counted_by: currentUser.user_code,
        counted_on: new Date().toISOString(),
        status: "Counted",
      };
    }
    return line;
  });

  setCycleCountTask({
    ...cycleCountTask,
    lines: updatedLines,
    counted_items: updatedLines.filter((l) => l.status === "Counted").length,
    items_with_discrepancy: updatedLines.filter(
      (l) => l.status === "Counted" && l.discrepancy !== 0
    ).length,
  });

  // Then sync with backend via API
};
```

### Step 4.4: Create Cycle Count Form Screen

**File:** `screens/CycleCountFormScreen.js`

**Features:**

- Create new Cycle Count Task
- Select warehouse, zone
- Select count type (Full, Cycle, Spot)
- Add items to count (with expected qty from stock ledger)
- Set schedule (optional)
- Set freeze stock option

### Step 4.5: Create Cycle Count Counting Screen

**File:** `screens/CycleCountCountingScreen.js`

**Features:**

- Display item to count
- Show expected quantity
- Input actual quantity
- Calculate discrepancy automatically
- Scan barcode to identify item
- Navigate to next item
- Show progress indicator

**Implementation:**

```javascript
export default function CycleCountCountingScreen({ route, navigation }) {
  const { taskTitle, lineId } = route.params;
  const [line, setLine] = useState(null);
  const [actualQty, setActualQty] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLine();
  }, []);

  const loadLine = async () => {
    // Load cycle count task and find the specific line
    const response = await cycleCountAPI.getByTitle(taskTitle);
    const foundLine = response.data.lines.find((l) => l.id === lineId);
    setLine(foundLine);
    setActualQty(foundLine.actual_qty?.toString() || "");
    setLoading(false);
  };

  const handleSubmit = async () => {
    const qty = parseFloat(actualQty);
    if (isNaN(qty)) {
      // Show error
      return;
    }

    // Record the count
    await recordCount(lineId, qty);

    // Navigate to next item or back to detail
    navigation.goBack();
  };

  return (
    <View>
      <Text>Item: {line?.itemCode}</Text>
      <Text>Bin: {line?.binLocation || "Warehouse Level"}</Text>
      <Text>Expected Qty: {line?.expectedQty}</Text>

      <TextInput
        value={actualQty}
        onChangeText={setActualQty}
        keyboardType="numeric"
        placeholder="Enter actual quantity"
      />

      {actualQty && (
        <Text>Discrepancy: {parseFloat(actualQty) - line.expectedQty}</Text>
      )}

      <Button title="Record Count" onPress={handleSubmit} />
    </View>
  );
}
```

---

## 5. Stock Ledger Implementation

### Step 5.1: Create Stock Ledger Data Models

**File:** `models/StockLedger.js`

```javascript
export class StockLedger {
  constructor(data) {
    this.itemCode = data.item_code || data.itemCode || "";
    this.warehouse = data.warehouse || "";
    this.binLocation = data.bin_location || data.binLocation || null;
    this.qty = data.qty || 0;
    this.reservedQty = data.reserved_qty || data.reservedQty || 0;
    this.availableQty = data.available_qty || data.availableQty || 0;
    this.lastTransactionDate =
      data.last_transaction_date || data.lastTransactionDate || null;
    this.lastTransactionType =
      data.last_transaction_type || data.lastTransactionType || null;
    this.lastTransactionRef =
      data.last_transaction_ref || data.lastTransactionRef || null;
    this.updatedAt = data.updated_at || data.updatedAt || null;
    this.createdAt = data.created_at || data.createdAt || null;
  }
}

export class StockTransaction {
  constructor(data) {
    this.id = data.id || 0;
    this.transactionDate =
      data.transaction_date || data.transactionDate || null;
    this.transactionType = data.transaction_type || data.transactionType || "";
    this.referenceDocType =
      data.reference_doc_type || data.referenceDocType || null;
    this.referenceDoc = data.reference_doc || data.referenceDoc || null;
    this.wmsTransactionTitle =
      data.wms_transaction_title || data.wmsTransactionTitle || null;
    this.itemCode = data.item_code || data.itemCode || "";
    this.warehouse = data.warehouse || "";
    this.binLocation = data.bin_location || data.binLocation || null;
    this.qtyChange = data.qty_change || data.qtyChange || 0;
    this.qtyBefore = data.qty_before || data.qtyBefore || 0;
    this.qtyAfter = data.qty_after || data.qtyAfter || 0;
    this.sourceBin = data.source_bin || data.sourceBin || null;
    this.targetBin = data.target_bin || data.targetBin || null;
    this.performedBy = data.performed_by || data.performedBy || null;
    this.notes = data.notes || data.notes || null;
    this.createdAt = data.created_at || data.createdAt || null;
  }
}
```

### Step 5.2: Create Stock Ledger List Screen

**File:** `screens/StockLedgerListScreen.js`

**Features:**

- Display all stock ledger entries
- Filter by warehouse, item code, bin location
- Show qty, reserved qty, available qty
- Group by item or warehouse
- Search functionality

**Implementation:**

```javascript
import React, { useState, useEffect } from "react";
import { View, FlatList, TextInput } from "react-native";
import { stockLedgerAPI } from "../api/client";
import { StockLedger } from "../models/StockLedger";

export default function StockLedgerListScreen({ navigation }) {
  const [stockLedger, setStockLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    warehouse: null,
    item_code: null,
    bin_location: null,
  });
  const [searchText, setSearchText] = useState("");

  const loadStockLedger = async () => {
    try {
      setLoading(true);
      const params = { ...filters };
      if (searchText) {
        params.item_code = searchText;
      }
      const response = await stockLedgerAPI.getAll(params);
      const data = response.data.map((item) => new StockLedger(item));
      setStockLedger(data);
    } catch (error) {
      console.error("Error loading Stock Ledger:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStockLedger();
  }, [filters, searchText]);

  const renderItem = ({ item }) => (
    <StockLedgerItem
      item={item}
      onPress={() =>
        navigation.navigate("StockDetail", {
          itemCode: item.itemCode,
          warehouse: item.warehouse,
        })
      }
    />
  );

  return (
    <View>
      <TextInput
        placeholder="Search by item code..."
        value={searchText}
        onChangeText={setSearchText}
      />
      <FilterBar filters={filters} onFilterChange={setFilters} />
      <FlatList
        data={stockLedger}
        renderItem={renderItem}
        keyExtractor={(item, index) =>
          `${item.itemCode}-${item.warehouse}-${
            item.binLocation || "null"
          }-${index}`
        }
      />
    </View>
  );
}
```

### Step 5.3: Create Stock Detail Screen (By Item/Warehouse)

**File:** `screens/StockDetailScreen.js`

**Features:**

- Show stock breakdown by bin for a specific item/warehouse
- Display total stock, reserved, available
- Show last transaction info
- Link to stock transaction history

**Implementation:**

```javascript
import React, { useState, useEffect } from "react";
import { View, ScrollView, Text } from "react-native";
import { stockLedgerAPI } from "../api/client";
import { StockLedger } from "../models/StockLedger";

export default function StockDetailScreen({ route, navigation }) {
  const { itemCode, warehouse } = route.params;
  const [stockBreakdown, setStockBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStockBreakdown();
  }, [itemCode, warehouse]);

  const loadStockBreakdown = async () => {
    try {
      setLoading(true);
      const response = await stockLedgerAPI.getByItemWarehouse(
        itemCode,
        warehouse
      );
      const data = response.data.map((item) => new StockLedger(item));
      setStockBreakdown(data);

      // Calculate totals
      const totalQty = data.reduce((sum, item) => sum + item.qty, 0);
      const totalReserved = data.reduce(
        (sum, item) => sum + item.reservedQty,
        0
      );
      const totalAvailable = data.reduce(
        (sum, item) => sum + item.availableQty,
        0
      );
    } catch (error) {
      console.error("Error loading stock breakdown:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView>
      <View style={styles.header}>
        <Text style={styles.itemCode}>{itemCode}</Text>
        <Text style={styles.warehouse}>{warehouse}</Text>
      </View>

      <View style={styles.summary}>
        <SummaryCard label="Total Qty" value={totalQty} />
        <SummaryCard label="Reserved" value={totalReserved} />
        <SummaryCard label="Available" value={totalAvailable} />
      </View>

      <View style={styles.breakdown}>
        <Text style={styles.sectionTitle}>Stock by Bin Location</Text>
        {stockBreakdown.map((item, index) => (
          <BinStockRow key={index} item={item} />
        ))}
      </View>

      <Button
        title="View Transaction History"
        onPress={() =>
          navigation.navigate("StockTransactions", {
            itemCode,
            warehouse,
          })
        }
      />
    </ScrollView>
  );
}
```

### Step 5.4: Create Stock Transaction History Screen

**File:** `screens/StockTransactionHistoryScreen.js`

**Features:**

- Display stock transaction history
- Filter by date range, transaction type, item, warehouse
- Show qty changes (before/after)
- Show source/target bins
- Show reference documents

**Implementation:**

```javascript
import React, { useState, useEffect } from "react";
import { View, FlatList } from "react-native";
import { stockTransactionAPI } from "../api/client";
import { StockTransaction } from "../models/StockLedger";

export default function StockTransactionHistoryScreen({ route }) {
  const { itemCode, warehouse } = route.params || {};
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    item_code: itemCode,
    warehouse: warehouse,
    transaction_type: null,
    from_date: null,
    to_date: null,
    limit: 100,
  });

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const response = await stockTransactionAPI.getAll(filters);
      const data = response.data.map((item) => new StockTransaction(item));
      setTransactions(data);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [filters]);

  const renderItem = ({ item }) => (
    <TransactionRow
      transaction={item}
      showQtyChange={true}
      showReference={true}
    />
  );

  return (
    <View>
      <FilterBar filters={filters} onFilterChange={setFilters} />
      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
      />
    </View>
  );
}
```

### Step 5.5: Add Stock Display to Item Detail Screen

**File:** `screens/ItemDetailScreen.js` (Update existing)

**Add Stock Section:**

```javascript
// Add to existing Item Detail Screen
const [stockInfo, setStockInfo] = useState(null);

useEffect(() => {
  loadStockInfo();
}, [itemCode, currentWarehouse]);

const loadStockInfo = async () => {
  try {
    const response = await stockLedgerAPI.getByItemWarehouse(
      itemCode,
      currentWarehouse
    );
    const totalQty = response.data.reduce((sum, item) => sum + item.qty, 0);
    const totalAvailable = response.data.reduce(
      (sum, item) => sum + item.available_qty,
      0
    );
    setStockInfo({ totalQty, totalAvailable, breakdown: response.data });
  } catch (error) {
    console.error("Error loading stock info:", error);
  }
};

// In render:
<View style={styles.stockSection}>
  <Text style={styles.sectionTitle}>Current Stock</Text>
  <Text>Total Qty: {stockInfo?.totalQty || 0}</Text>
  <Text>Available: {stockInfo?.totalAvailable || 0}</Text>
  <Button
    title="View Stock Breakdown"
    onPress={() =>
      navigation.navigate("StockDetail", {
        itemCode,
        warehouse: currentWarehouse,
      })
    }
  />
</View>;
```

---

## 6. Updated Existing Features

### Step 6.1: Update Inbound Session Creation

**File:** `screens/ReceivingScreen.js` (or your receiving screen)

**Changes:**

```javascript
// Add Transfer In option
const [sourceType, setSourceType] = useState("ASN"); // 'ASN' or 'TransferIn'
const [selectedASN, setSelectedASN] = useState(null);
const [selectedTransferIn, setSelectedTransferIn] = useState(null);

// Update session creation
const createSession = async () => {
  const sessionData = {
    inbound_session: generateSessionId(),
    status: "Active",
    dock: selectedDock,
    user_id: currentUser.user_code,
    device_id: deviceId,
  };

  if (sourceType === "ASN") {
    sessionData.asn_no = selectedASN;
  } else if (sourceType === "TransferIn") {
    sessionData.transfer_in = selectedTransferIn; // NEW
  }

  await inboundAPI.updateInboundSession(sessionData);
};
```

### Step 6.2: Update Inbound Session List

**File:** `screens/InboundSessionListScreen.js` (Update existing)

**Changes:**

```javascript
// The API now returns transfer_in field
const renderItem = ({ item }) => (
  <SessionRow
    session={item}
    sourceType={item.asn_no ? "ASN" : "Transfer In"} // NEW
    sourceDoc={item.asn_no || item.transfer_in} // NEW
  />
);
```

---

## 7. Testing Checklist

### Transfer In Testing

- [ ] Create Transfer In document
- [ ] View Transfer In list
- [ ] Filter Transfer In by status/showroom/warehouse
- [ ] Create inbound session with transfer_in
- [ ] Receive items from Transfer In
- [ ] Complete receiving session
- [ ] Verify stock increases after receiving
- [ ] Verify putaway task created (no sorting)

### Material Request Testing

- [ ] Create Material Request
- [ ] View Material Request list
- [ ] Filter by status/warehouse/showroom
- [ ] View Material Request details
- [ ] Pick items for Material Request
- [ ] Verify stock decreases after picking
- [ ] Update picked quantities

### Cycle Count Testing

- [ ] Create Cycle Count Task
- [ ] View Cycle Count list
- [ ] Filter by status/warehouse/zone
- [ ] Record actual counts
- [ ] Verify discrepancy calculation
- [ ] Review discrepancies
- [ ] Approve and adjust stock
- [ ] Verify stock updated after approval

### Stock Ledger Testing

- [ ] View stock ledger list
- [ ] Filter by warehouse/item/bin
- [ ] View stock breakdown by item/warehouse
- [ ] Verify real-time stock updates
- [ ] View stock transaction history
- [ ] Filter transactions by date/type
- [ ] Verify stock displayed in item detail

### Integration Testing

- [ ] Transfer In → Receiving → Putaway → Stock Update
- [ ] Material Request → Picking → Stock Decrease
- [ ] Cycle Count → Count → Approve → Stock Adjustment
- [ ] Verify all stock changes reflected in Stock Ledger
- [ ] Verify all transactions logged in Stock Transactions

---

## 📱 UI/UX Recommendations

### 1. Navigation Structure

```
Main Menu
├── Receiving
│   ├── ASN Receiving (Existing)
│   └── Transfer In Receiving (NEW)
├── Putaway (Existing)
├── Picking (Existing)
│   └── Material Request Picking (NEW)
├── Cycle Count (NEW)
│   ├── Cycle Count List
│   ├── Create Cycle Count
│   └── Count Items
├── Stock (NEW)
│   ├── Stock Ledger
│   ├── Stock by Item
│   └── Transaction History
└── Settings (Existing)
```

### 2. Color Coding

- **Transfer In**: Blue theme (inbound from showroom)
- **Material Request**: Orange theme (outbound to showroom)
- **Cycle Count**: Purple theme (inventory verification)
- **Stock Ledger**: Green theme (stock information)

### 3. Status Indicators

Use consistent status colors:

- **Draft**: Gray
- **Active/In Progress**: Blue
- **Completed**: Green
- **Cancelled**: Red
- **Pending**: Yellow

### 4. Barcode Scanning

Implement barcode scanning for:

- Item identification in Cycle Count
- Carton scanning in Transfer In receiving
- Item verification in Material Request picking

### 5. Offline Support

Consider implementing:

- Offline queue for API calls
- Local storage for recent data
- Sync when connection restored

---

## 🔧 Implementation Priority

### Phase 1: Core Features (Week 1-2)

1. ✅ API Integration Setup
2. ✅ Transfer In List & Detail Screens
3. ✅ Material Request List & Detail Screens
4. ✅ Update Receiving Screen for Transfer In

### Phase 2: Stock Features (Week 3)

5. ✅ Stock Ledger List Screen
6. ✅ Stock Detail Screen
7. ✅ Stock Transaction History

### Phase 3: Cycle Count (Week 4)

8. ✅ Cycle Count List & Detail Screens
9. ✅ Cycle Count Counting Screen
10. ✅ Cycle Count Form Screen

### Phase 4: Polish & Testing (Week 5)

11. ✅ UI/UX improvements
12. ✅ Error handling
13. ✅ Testing & bug fixes

---

## 📝 Key Implementation Notes

### 1. Authentication

All API calls require authentication token:

```javascript
headers: {
  'Authorization': `Bearer ${authToken}`
}
```

### 2. Error Handling

Always handle API errors gracefully:

```javascript
try {
  const response = await api.call();
  // Handle success
} catch (error) {
  if (error.response?.status === 401) {
    // Redirect to login
  } else if (error.response?.status === 404) {
    // Show "Not Found" message
  } else {
    // Show generic error message
  }
}
```

### 3. Loading States

Always show loading indicators:

- During API calls
- When navigating between screens
- When submitting forms

### 4. Data Refresh

Implement pull-to-refresh on list screens:

- Transfer In List
- Material Request List
- Cycle Count List
- Stock Ledger List

### 5. Form Validation

Validate all forms before submission:

- Required fields
- Data types (numbers, dates)
- Business rules (e.g., qty > 0)

---

## 🎨 Sample Screen Layouts

### Transfer In List Screen Layout

```
┌─────────────────────────────┐
│  Transfer In                │
│  [Filter] [Search]          │
├─────────────────────────────┤
│  TI-0001                    │
│  SHOWROOM-001 → WH-MAIN     │
│  Status: Submitted          │
│  Qty: 80.00                 │
├─────────────────────────────┤
│  TI-0002                    │
│  SHOWROOM-002 → WH-MAIN     │
│  Status: In Transit         │
│  Qty: 50.00                 │
└─────────────────────────────┘
```

### Cycle Count Counting Screen Layout

```
┌─────────────────────────────┐
│  Cycle Count: CC-0001        │
│  Item: ITEM-001              │
│  Bin: RACK-A-01-BIN-05      │
├─────────────────────────────┤
│  Expected: 50.00             │
│  ┌─────────────────────┐   │
│  │ Actual: [____]       │   │
│  └─────────────────────┘   │
│  Discrepancy: -2.00         │
├─────────────────────────────┤
│  [Record Count]             │
│  [Next Item]                │
└─────────────────────────────┘
```

### Stock Detail Screen Layout

```
┌─────────────────────────────┐
│  ITEM-001 @ WH-MAIN          │
├─────────────────────────────┤
│  Total: 70.00               │
│  Reserved: 5.00              │
│  Available: 65.00            │
├─────────────────────────────┤
│  RACK-A-01-BIN-05: 50.00    │
│  RACK-A-01-BIN-06: 20.00    │
├─────────────────────────────┤
│  [View Transaction History] │
└─────────────────────────────┘
```

---

## 🚀 Quick Start Checklist

- [ ] Set up API client with new endpoints
- [ ] Create data models for new entities
- [ ] Create Transfer In screens (List, Detail, Form)
- [ ] Create Material Request screens (List, Detail, Form)
- [ ] Create Cycle Count screens (List, Detail, Form, Counting)
- [ ] Create Stock Ledger screens (List, Detail, Transaction History)
- [ ] Update Receiving screen to support Transfer In
- [ ] Add navigation routes
- [ ] Add menu items
- [ ] Test all workflows
- [ ] Implement error handling
- [ ] Add loading states
- [ ] Polish UI/UX

---

**End of Mobile App Implementation Guide**
