# Cycle Count - Opening Stock Identification Guide

## Overview

This guide explains how the mobile app can identify whether a cycle count line is for **opening stock** (new items with no previous history) or **normal cycle count** (existing stock with expected quantities).

---

## Identification Methods

### Method 1: Using `is_opening_stock` Field (Recommended) ⭐

The API now includes an `is_opening_stock` boolean field in each line response.

**Response Example:**

```json
{
  "ok": true,
  "data": {
    "title": "CC-A1-R01-L1-B1-MK6SK143",
    "items": [
      {
        "line_id": "LINE-276",
        "item_code": "SKU-001",
        "expected_qty": 0,
        "actual_qty": 10,
        "is_opening_stock": true, // ✅ Opening stock indicator
        "discrepancy": 10
      },
      {
        "line_id": "LINE-277",
        "item_code": "SKU-002",
        "expected_qty": 50,
        "actual_qty": 55,
        "is_opening_stock": false, // ✅ Normal cycle count
        "discrepancy": 5
      }
    ]
  }
}
```

**Mobile App Logic:**

```javascript
if (line.is_opening_stock) {
  // This is opening stock - new item, no previous history
  // Display: "New Item" or "Opening Stock"
  // Show only actual_qty (no expected_qty to compare)
} else {
  // This is normal cycle count - existing stock
  // Display: expected_qty vs actual_qty with variance
}
```

---

### Method 2: Using `expected_qty` Value

Check the `expected_qty` value directly.

**Logic:**

- `expected_qty = 0` → **Opening Stock** (no previous history)
- `expected_qty > 0` → **Normal Cycle Count** (existing stock)

**Mobile App Logic:**

```javascript
const isOpeningStock = line.expected_qty === 0 && line.actual_qty > 0;

if (isOpeningStock) {
  // Opening stock
} else {
  // Normal cycle count
}
```

---

### Method 3: Using Task-Level `is_blind_count`

The task-level `is_blind_count` field indicates if **all lines** in the task are opening stock.

**Response Example:**

```json
{
  "ok": true,
  "data": {
    "title": "CC-A1-R01-L1-B1-MK6SK143",
    "is_blind_count": true,  // All lines have expected_qty = 0
    "items": [...]
  }
}
```

**Note:** This is at the **task level**, not line level. Use this for overall task type, but check line-level `is_opening_stock` for individual items.

---

## Field Reference

### Line-Level Fields

| Field              | Type    | Description                 | Opening Stock  | Normal Count                  |
| ------------------ | ------- | --------------------------- | -------------- | ----------------------------- |
| `is_opening_stock` | boolean | `true` if opening stock     | ✅ `true`      | ❌ `false`                    |
| `expected_qty`     | number  | Expected quantity           | `0`            | `> 0`                         |
| `actual_qty`       | number  | Counted quantity            | `> 0`          | `> 0`                         |
| `discrepancy`      | number  | `actual_qty - expected_qty` | `= actual_qty` | `= actual_qty - expected_qty` |

### Task-Level Fields

| Field            | Type    | Description                                 |
| ---------------- | ------- | ------------------------------------------- |
| `is_blind_count` | boolean | `true` if all lines have `expected_qty = 0` |

---

## UI Display Recommendations

### Opening Stock Display

**When `is_opening_stock = true`:**

```
┌─────────────────────────────┐
│ Item: SKU-001               │
│ Type: Opening Stock (New)   │
│ Counted: 10                 │
│ Status: ✅ Counted           │
└─────────────────────────────┘
```

**Features:**

- Show "Opening Stock" or "New Item" badge
- Display only `actual_qty` (no expected_qty to show)
- Highlight in different color (e.g., green for new items)
- Show `discrepancy = actual_qty` (positive)

---

### Normal Cycle Count Display

**When `is_opening_stock = false`:**

```
┌─────────────────────────────┐
│ Item: SKU-002               │
│ Expected: 50                 │
│ Counted: 55                  │
│ Variance: +5                 │
│ Status: ⚠️ Variance           │
└─────────────────────────────┘
```

**Features:**

- Show expected vs actual comparison
- Display variance (positive or negative)
- Highlight if variance is significant
- Show `discrepancy = actual_qty - expected_qty`

---

## API Response Examples

### Opening Stock Line

```json
{
  "line_id": "LINE-276",
  "item_code": "SKU-001",
  "expected_qty": 0,
  "actual_qty": 10,
  "counted_qty": 10,
  "is_opening_stock": true,
  "discrepancy": 10,
  "variance_qty": 10,
  "bin_location": "A1-R01-L1-B1",
  "status": "Counted"
}
```

**Characteristics:**

- ✅ `is_opening_stock = true`
- ✅ `expected_qty = 0`
- ✅ `actual_qty > 0`
- ✅ `discrepancy = actual_qty` (positive)

---

### Normal Cycle Count Line

```json
{
  "line_id": "LINE-277",
  "item_code": "SKU-002",
  "expected_qty": 50,
  "actual_qty": 55,
  "counted_qty": 55,
  "is_opening_stock": false,
  "discrepancy": 5,
  "variance_qty": 5,
  "bin_location": "A1-R01-L1-B1",
  "status": "Counted"
}
```

**Characteristics:**

- ❌ `is_opening_stock = false`
- ✅ `expected_qty > 0`
- ✅ `actual_qty > 0`
- ✅ `discrepancy = actual_qty - expected_qty`

---

## Mobile App Implementation

### Swift (iOS) Example

```swift
struct CycleCountLine {
    let lineId: String
    let itemCode: String
    let expectedQty: Double
    let actualQty: Double?
    let isOpeningStock: Bool
    let discrepancy: Double?
}

func displayLine(_ line: CycleCountLine) {
    if line.isOpeningStock {
        // Opening stock display
        print("New Item: \(line.itemCode)")
        print("Counted: \(line.actualQty ?? 0)")
    } else {
        // Normal cycle count display
        print("Item: \(line.itemCode)")
        print("Expected: \(line.expectedQty)")
        print("Counted: \(line.actualQty ?? 0)")
        print("Variance: \(line.discrepancy ?? 0)")
    }
}
```

### Kotlin (Android) Example

```kotlin
data class CycleCountLine(
    val lineId: String,
    val itemCode: String,
    val expectedQty: Double,
    val actualQty: Double?,
    val isOpeningStock: Boolean,
    val discrepancy: Double?
)

fun displayLine(line: CycleCountLine) {
    if (line.isOpeningStock) {
        // Opening stock display
        println("New Item: ${line.itemCode}")
        println("Counted: ${line.actualQty ?: 0}")
    } else {
        // Normal cycle count display
        println("Item: ${line.itemCode}")
        println("Expected: ${line.expectedQty}")
        println("Counted: ${line.actualQty ?: 0}")
        println("Variance: ${line.discrepancy ?: 0}")
    }
}
```

### JavaScript/React Native Example

```javascript
function displayLine(line) {
  if (line.is_opening_stock) {
    // Opening stock display
    return (
      <View>
        <Text>New Item: {line.item_code}</Text>
        <Text>Counted: {line.actual_qty}</Text>
        <Badge color="green">Opening Stock</Badge>
      </View>
    );
  } else {
    // Normal cycle count display
    return (
      <View>
        <Text>Item: {line.item_code}</Text>
        <Text>Expected: {line.expected_qty}</Text>
        <Text>Counted: {line.actual_qty}</Text>
        <Text>Variance: {line.discrepancy}</Text>
      </View>
    );
  }
}
```

---

## Summary

### Quick Identification

**Opening Stock:**

- ✅ `is_opening_stock = true`
- ✅ `expected_qty = 0`
- ✅ `actual_qty > 0`

**Normal Cycle Count:**

- ❌ `is_opening_stock = false`
- ✅ `expected_qty > 0`
- ✅ `actual_qty > 0`

### Best Practice

**Use `is_opening_stock` field** for the most reliable identification. It's explicitly set by the API and handles all edge cases.

---

## Related Documentation

- `CYCLE_COUNT_STOCK_UPDATE_FLOW.md` - How stock is updated for opening stock
- `CYCLE_COUNT_MOBILE_APP_REQUIREMENTS.md` - Mobile app API requirements
- `CYCLE_COUNT_API_COMPLETE.md` - Complete API documentation
