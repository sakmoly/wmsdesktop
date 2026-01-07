# API to Database Field Mapping

## Current Mappings (Working Correctly)

### ✅ WmsScanEvent Table
| API Field | Database Column | Status |
|-----------|----------------|--------|
| `offline_uuid` | `offline_uuid` | ✅ Match |
| `event_type` | `event_type` | ✅ Match |
| `event_time` | `event_time` | ✅ Match |
| `device_id` | `device_id` | ✅ Match |
| `user_id` | `user_id` | ✅ Match |
| `asn_no` | `advance_shipping_notice` | ✅ Maps correctly |
| `transfer_order` | `transfer_order` | ✅ Match |
| `inbound_session` | `inbound_session` | ✅ Match |
| `carton_id` | `carton_id` | ✅ Match |
| `item_code` | `item_code` | ✅ Match |
| `qty` | `qty` | ✅ Match |
| `store` | `store` | ✅ Match |
| `box_id` | `box_id` | ✅ Match |
| `tc_id` | `tc_id` | ✅ Match |
| `rack` | `rack` | ✅ Match |
| `bin` | `bin` | ✅ Match |

### ✅ ReceivingCarton Table
| API Field | Database Column | Status |
|-----------|----------------|--------|
| `asn_no` | `advance_shipping_notice` | ✅ Maps correctly |
| `inbound_session` | `inbound_session` | ✅ Match |
| `carton_id` | `carton_id` | ✅ Match |
| `status` | `status` | ✅ Match |
| `locked_by` | `locked_by` | ✅ Match |
| `locked_on` | `locked_on` | ✅ Match |
| `updated_on` | `updated_on` | ✅ Match |

### ✅ SortBox Table
| API Field | Database Column | Status |
|-----------|----------------|--------|
| `box_id` | `box_id` | ✅ Match |
| `asn_no` | `advance_shipping_notice` | ✅ Maps correctly |
| `to_no` | `transfer_order` | ✅ Maps correctly |
| `store` | `store` | ✅ Match |
| `status` | `status` | ✅ Match |
| `purpose` | `purpose` | ✅ Match |
| `updated_on` | `updated_on` | ✅ Match |

### ✅ TransferCarton Table
| API Field | Database Column | Status |
|-----------|----------------|--------|
| `tc_id` | `tc_id` | ✅ Match |
| `asn_no` | `advance_shipping_notice` | ✅ Maps correctly |
| `to_no` | `transfer_order` | ✅ Maps correctly |
| `store` | `store` | ✅ Match |
| `status` | `status` | ✅ Match |
| `updated_on` | `updated_on` | ✅ Match |

## ⚠️ Field Name Differences (Mapping Required)

### 1. ASN Primary Key
- **API:** `asn_no` (e.g., "ASN-00045")
- **Database:** `title` (PRIMARY KEY in tabAdvanceShippingNotice)
- **Model:** `Title` property
- **Status:** ✅ Works - API `asn_no` maps to DB `title` via the Title property

### 2. Transfer Order Primary Key
- **API:** `to_no` (e.g., "TO-00012")
- **Database:** `title` (PRIMARY KEY in tabTransferOrder)
- **Model:** `Title` property
- **Status:** ✅ Works - API `to_no` maps to DB `title` via the Title property

### 3. Item Fields
- **API:** `item_code`, `item_name`
- **Database:** `code`, `name`
- **Model:** `Code`, `Name` properties
- **Status:** ⚠️ Name mismatch - API uses `item_` prefix

### 4. Scanned Items (Derived from Events)
- **API:** `scanned_qty`, `scanned_on`
- **Database:** `qty`, `event_time` (in tabWmsScanEvent)
- **Status:** ⚠️ Different field names - needs mapping when syncing

## Recommendations

Since the database schema is already established and working, the best approach is:

1. **Keep current schema** - The database field names are descriptive and correct
2. **Handle mapping in API layer** - When receiving API requests:
   - Map `asn_no` → `title` (for ASN operations)
   - Map `to_no` → `title` (for TO operations)
   - Map `item_code` → `code` (for Item operations)
   - Map `item_name` → `name` (for Item operations)
3. **When sending API responses**, map back:
   - Map `title` → `asn_no` (for ASN)
   - Map `title` → `to_no` (for TO)
   - Map `code` → `item_code` (for Items)
   - Map `name` → `item_name` (for Items)

This is a common pattern in API design where the API uses shorter/abbreviated field names while the database uses more descriptive names.

