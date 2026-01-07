# PACK_BOX_TO_TC Event Format

## Issue Fixed

The Transfer Carton contents were not showing because `PACK_BOX_TO_TC` events were sent with `item_code: null` and `qty: null`. The transfer carton contents query requires `item_code IS NOT NULL`.

## Solution

The backend API now **automatically expands** box-level `PACK_BOX_TO_TC` events into item-level events by looking up box contents from `SORT_TO_BOX` events.

## API Endpoint

**Endpoint:** `POST /api/events/batch`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {auth_token}
```

## Option 1: Box-Level Event (Recommended - Auto-Expanded)

Send a single box-level event. The backend will automatically look up the box contents and create item-level events.

### Request Body (Box-Level)

```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-12-26T19:02:32.337Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0004",
      "transfer_order": "TO-00012",
      "store": "WAREHOUSE",
      "box_id": "BOX-WHMAIN-391259",
      "tc_id": "TC-1766775570711",
      "carton_id": null,
      "item_code": null,
      "qty": null,
      "inbound_session": "SESSION-ASN0004-DEVICE001-USER172188",
      "rack": null,
      "bin": null
    }
  ]
}
```

**What Happens:**
1. Backend receives the box-level event
2. Backend queries `tabWmsScanEvent` for `SORT_TO_BOX` events with `box_id = "BOX-WHMAIN-391259"`
3. For each item in the box, backend creates a separate `PACK_BOX_TO_TC` event with `item_code` and `qty`
4. All item-level events are saved to the database

## Option 2: Item-Level Events (Manual)

Send multiple events, one per item in the box. This gives you full control over what gets recorded.

### Request Body (Item-Level)

```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-12-26T19:02:32.337Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0004",
      "transfer_order": "TO-00012",
      "store": "WAREHOUSE",
      "box_id": "BOX-WHMAIN-391259",
      "tc_id": "TC-1766775570711",
      "carton_id": "CTN-0101",
      "item_code": "ITEM-001",
      "qty": 25.00,
      "inbound_session": "SESSION-ASN0004-DEVICE001-USER172188",
      "rack": null,
      "bin": null
    },
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440002",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-12-26T19:02:32.337Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0004",
      "transfer_order": "TO-00012",
      "store": "WAREHOUSE",
      "box_id": "BOX-WHMAIN-391259",
      "tc_id": "TC-1766775570711",
      "carton_id": "CTN-0102",
      "item_code": "ITEM-002",
      "qty": 15.00,
      "inbound_session": "SESSION-ASN0004-DEVICE001-USER172188",
      "rack": null,
      "bin": null
    }
  ]
}
```

## Response

**Success Response:**
```json
{
  "ok": true,
  "message": "Events saved successfully",
  "inserted_count": 2,
  "total_count": 1
}
```

**Note:** When using Option 1 (box-level), `inserted_count` will be the number of item-level events created (one per item in the box), while `total_count` will be 1 (the original box-level event).

## Required Fields

- `offline_uuid` - Unique identifier for the event (required)
- `event_type` - Must be `"PACK_BOX_TO_TC"` (required)
- `event_time` - ISO 8601 timestamp (required)
- `device_id` - Device identifier (required)
- `user_id` - User identifier (required)
- `box_id` - Box identifier (required for Option 1)
- `tc_id` - Transfer Carton identifier (required)
- `item_code` - Item code (required for Option 2, null for Option 1)
- `qty` - Quantity (required for Option 2, null for Option 1)
- `carton_id` - Source carton ID (optional, but recommended for Option 2)

## Field Name Variations

The API supports both naming conventions:

- `advance_shipping_notice` OR `asn_no` → stored as `advance_shipping_notice`
- `transfer_order` OR `to_no` → stored as `transfer_order`

## How Transfer Carton Contents Are Retrieved

The Transfer Carton Details API (`GET /api/transfer-cartons/:tc_id`) queries:

```sql
SELECT item_code, carton_id, qty, user_id, event_time
FROM tabWmsScanEvent
WHERE tc_id = ?
  AND event_type = 'PACK_BOX_TO_TC'
  AND item_code IS NOT NULL
ORDER BY event_time DESC
```

**Important:** Events with `item_code IS NULL` are **not included** in transfer carton contents. This is why the backend now auto-expands box-level events into item-level events.

## Handling Multiple Items

### How Multiple Items Are Processed

The backend handles multiple items intelligently by **grouping** them based on `item_code` + `carton_id` combination:

1. **Different Items** → Separate entries (e.g., ITEM-001 and ITEM-002)
2. **Same Item, Different Cartons** → Separate entries (e.g., ITEM-001 from CTN-0101 and ITEM-001 from CTN-0102)
3. **Same Item, Same Carton** → Quantities are **summed** (e.g., ITEM-001 from CTN-0101 with qty 10 + ITEM-001 from CTN-0101 with qty 5 = ITEM-001 from CTN-0101 with qty 15)

### Example Scenarios

#### Scenario 1: Box with Multiple Different Items

**Box Contents (from SORT_TO_BOX events):**
- ITEM-001 from CTN-0101, qty: 25
- ITEM-002 from CTN-0101, qty: 15
- ITEM-003 from CTN-0102, qty: 30

**Box-Level Event Sent:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "event_type": "PACK_BOX_TO_TC",
      "box_id": "BOX-WHMAIN-391259",
      "tc_id": "TC-1766775570711",
      "item_code": null,
      "qty": null
    }
  ]
}
```

**Backend Creates 3 Item-Level Events:**
1. ITEM-001 from CTN-0101, qty: 25
2. ITEM-002 from CTN-0101, qty: 15
3. ITEM-003 from CTN-0102, qty: 30

**Transfer Carton Contents Shows:**
```json
{
  "contents": [
    { "item_code": "ITEM-001", "source_carton": "CTN-0101", "qty": 25 },
    { "item_code": "ITEM-002", "source_carton": "CTN-0101", "qty": 15 },
    { "item_code": "ITEM-003", "source_carton": "CTN-0102", "qty": 30 }
  ]
}
```

#### Scenario 2: Same Item from Different Cartons

**Box Contents:**
- ITEM-001 from CTN-0101, qty: 25
- ITEM-001 from CTN-0102, qty: 20

**Backend Creates 2 Separate Events:**
1. ITEM-001 from CTN-0101, qty: 25
2. ITEM-001 from CTN-0102, qty: 20

**Transfer Carton Contents Shows:**
```json
{
  "contents": [
    { "item_code": "ITEM-001", "source_carton": "CTN-0101", "qty": 25 },
    { "item_code": "ITEM-001", "source_carton": "CTN-0102", "qty": 20 }
  ]
}
```

**Note:** These are shown as **separate entries** because they come from different source cartons.

#### Scenario 3: Same Item from Same Carton (Quantities Summed)

**Box Contents:**
- ITEM-001 from CTN-0101, qty: 10 (sorted at 10:00 AM)
- ITEM-001 from CTN-0101, qty: 15 (sorted at 10:30 AM)

**Backend Groups and Sums:**
- ITEM-001 from CTN-0101, qty: 25 (10 + 15)

**Transfer Carton Contents Shows:**
```json
{
  "contents": [
    { "item_code": "ITEM-001", "source_carton": "CTN-0101", "qty": 25 }
  ]
}
```

**Note:** Quantities are **automatically summed** when the same `item_code` + `carton_id` combination appears multiple times.

#### Scenario 4: Complex Box with Mixed Items

**Box Contents:**
- ITEM-001 from CTN-0101, qty: 10
- ITEM-001 from CTN-0101, qty: 15 (same item, same carton - will be summed)
- ITEM-001 from CTN-0102, qty: 20 (same item, different carton - separate entry)
- ITEM-002 from CTN-0101, qty: 30
- ITEM-003 from CTN-0103, qty: 5

**Backend Processing:**
1. Groups ITEM-001 from CTN-0101: 10 + 15 = 25
2. Keeps ITEM-001 from CTN-0102: 20 (separate)
3. Keeps ITEM-002 from CTN-0101: 30
4. Keeps ITEM-003 from CTN-0103: 5

**Transfer Carton Contents Shows:**
```json
{
  "contents": [
    { "item_code": "ITEM-001", "source_carton": "CTN-0101", "qty": 25 },
    { "item_code": "ITEM-001", "source_carton": "CTN-0102", "qty": 20 },
    { "item_code": "ITEM-002", "source_carton": "CTN-0101", "qty": 30 },
    { "item_code": "ITEM-003", "source_carton": "CTN-0103", "qty": 5 }
  ]
}
```

### Manual Item-Level Events (Multiple Items)

If you want to send multiple items manually, include all items in the `events` array:

```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-12-26T19:02:32.337Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0004",
      "transfer_order": "TO-00012",
      "store": "WAREHOUSE",
      "box_id": "BOX-WHMAIN-391259",
      "tc_id": "TC-1766775570711",
      "carton_id": "CTN-0101",
      "item_code": "ITEM-001",
      "qty": 25.00
    },
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440002",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-12-26T19:02:32.337Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0004",
      "transfer_order": "TO-00012",
      "store": "WAREHOUSE",
      "box_id": "BOX-WHMAIN-391259",
      "tc_id": "TC-1766775570711",
      "carton_id": "CTN-0101",
      "item_code": "ITEM-002",
      "qty": 15.00
    },
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440003",
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2025-12-26T19:02:32.337Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-172188",
      "advance_shipping_notice": "ASN-0004",
      "transfer_order": "TO-00012",
      "store": "WAREHOUSE",
      "box_id": "BOX-WHMAIN-391259",
      "tc_id": "TC-1766775570711",
      "carton_id": "CTN-0102",
      "item_code": "ITEM-003",
      "qty": 30.00
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Events saved successfully",
  "inserted_count": 3,
  "total_count": 3
}
```

### Key Points for Multiple Items

1. **Grouping Key:** Items are grouped by `item_code` + `carton_id` combination
2. **Quantity Summing:** Same `item_code` + `carton_id` → quantities are summed
3. **Separate Entries:** Different `item_code` OR different `carton_id` → separate entries
4. **Auto-Expansion:** Box-level events automatically expand to handle all items in the box
5. **Manual Control:** Item-level events give you full control over what gets recorded

## Testing

After sending the event, verify the transfer carton contents:

```http
GET /api/transfer-cartons/TC-1766775570711
Authorization: Bearer {auth_token}
```

The response should include a `contents` array with all items that were packed into the transfer carton, properly grouped and summed.

