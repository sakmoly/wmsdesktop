# Desktop App Event Creation Guide

## Overview

This guide explains how to create scan events from the desktop application to update Transfer Order quantities (`sorted_qty` and `packed_qty`).

## Setup

### 1. Initialize the Event API Service

In your application startup (e.g., `App.xaml.cs` or main window):

```csharp
using Wms.Desktop.Services;

// Initialize with your API base URL and auth token
EventApiService.Initialize(
    baseUrl: "http://192.168.103.219:3000",
    authToken: "YOUR_AUTH_TOKEN_HERE"
);
```

### 2. Get Auth Token

You can get the auth token from your existing authentication service or login API.

## Creating Events

### Example 1: Create SORT_TO_BOX Events

When items are sorted into boxes:

```csharp
using Wms.Desktop.Services;
using Wms.Desktop.Models;

// Create events for items sorted to a box
var events = new List<WmsScanEvent>();

// Example: Sort item SKU-JEANS-021-BLU-32 (qty: 100) to box BOX-STORE-001-001
events.Add(EventApiService.CreateSortToBoxEvent(
    deviceId: "DESKTOP-001",
    userId: "USER-2",
    asnNo: "ASN-0002",
    transferOrder: "TO-0002",
    itemCode: "SKU-JEANS-021-BLU-32",
    qty: 100,
    store: "STORE-001",
    boxId: "BOX-STORE-001-001",
    cartonId: "CTN-0101",  // Optional: source carton
    inboundSession: "SESSION-ASN0002-DEVICE4-USER4"  // Optional
));

// Send events to API
bool success = await EventApiService.SendEventsAsync(events);
if (success)
{
    Console.WriteLine("Events sent successfully!");
    // Transfer Order sorted_qty will be updated automatically
}
```

### Example 2: Create PACK_BOX_TO_TC Events (Item-Level)

When boxes are packed into transfer cartons:

```csharp
var events = new List<WmsScanEvent>();

// Example: Pack item from box to transfer carton
events.Add(EventApiService.CreatePackBoxToTCEvent(
    deviceId: "DESKTOP-001",
    userId: "USER-2",
    asnNo: "ASN-0002",
    transferOrder: "TO-0002",
    itemCode: "SKU-JEANS-021-BLU-32",
    qty: 100,
    boxId: "BOX-STORE-001-001",
    tcId: "TC-0001",
    cartonId: "CTN-0101",  // Optional
    store: "STORE-001"  // Optional
));

bool success = await EventApiService.SendEventsAsync(events);
```

### Example 3: Create PACK_BOX_TO_TC Events (Box-Level - Recommended)

Send a single box-level event. The backend will automatically expand it into item-level events:

```csharp
var events = new List<WmsScanEvent>();

// Example: Pack entire box to transfer carton
events.Add(EventApiService.CreatePackBoxToTCEventBoxLevel(
    deviceId: "DESKTOP-001",
    userId: "USER-2",
    asnNo: "ASN-0002",
    transferOrder: "TO-0002",
    boxId: "BOX-STORE-001-001",
    tcId: "TC-0001",
    store: "STORE-001"
));

bool success = await EventApiService.SendEventsAsync(events);
// Backend will automatically look up box contents from SORT_TO_BOX events
// and create item-level PACK_BOX_TO_TC events
```

## Complete Example: Update TO-0002 Quantities

Here's a complete example to create events for TO-0002:

```csharp
using Wms.Desktop.Services;
using Wms.Desktop.Models;

// Initialize service (do this once at startup)
EventApiService.Initialize(
    baseUrl: "http://192.168.103.219:3000",
    authToken: "YOUR_TOKEN"
);

// Create SORT_TO_BOX events for TO-0002
var sortEvents = new List<WmsScanEvent>
{
    // SKU-JEANS-021-BLU-32: 200 units sorted to STORE-001
    EventApiService.CreateSortToBoxEvent(
        "DESKTOP-001", "USER-2", "ASN-0002", "TO-0002",
        "SKU-JEANS-021-BLU-32", 200, "STORE-001", "BOX-STORE-001-001", "CTN-0101"
    ),
    // SKU-JEANS-021-BLU-34: 100 units sorted to STORE-001
    EventApiService.CreateSortToBoxEvent(
        "DESKTOP-001", "USER-2", "ASN-0002", "TO-0002",
        "SKU-JEANS-021-BLU-34", 100, "STORE-001", "BOX-STORE-001-001", "CTN-0102"
    ),
    // SKU-SHIRT-001-WHT-L: 40 units sorted to STORE-003
    EventApiService.CreateSortToBoxEvent(
        "DESKTOP-001", "USER-2", "ASN-0002", "TO-0002",
        "SKU-SHIRT-001-WHT-L", 40, "STORE-003", "BOX-STORE-003-001", "CTN-0103"
    ),
    // SKU-SHIRT-001-WHT-M: 60 units sorted to STORE-003
    EventApiService.CreateSortToBoxEvent(
        "DESKTOP-001", "USER-2", "ASN-0002", "TO-0002",
        "SKU-SHIRT-001-WHT-M", 60, "STORE-003", "BOX-STORE-003-001", "CTN-0102"
    )
};

// Send sort events
bool sortSuccess = await EventApiService.SendEventsAsync(sortEvents);
Console.WriteLine($"Sort events sent: {sortSuccess}");

// Create PACK_BOX_TO_TC events (box-level - recommended)
var packEvents = new List<WmsScanEvent>
{
    EventApiService.CreatePackBoxToTCEventBoxLevel(
        "DESKTOP-001", "USER-2", "ASN-0002", "TO-0002",
        "BOX-STORE-001-001", "TC-0001", "STORE-001"
    ),
    EventApiService.CreatePackBoxToTCEventBoxLevel(
        "DESKTOP-001", "USER-2", "ASN-0002", "TO-0002",
        "BOX-STORE-003-001", "TC-0002", "STORE-003"
    )
};

// Send pack events
bool packSuccess = await EventApiService.SendEventsAsync(packEvents);
Console.WriteLine($"Pack events sent: {packSuccess}");

// After sending events, Transfer Order quantities will be updated automatically:
// - sorted_qty will be updated from SORT_TO_BOX events
// - packed_qty will be updated from PACK_BOX_TO_TC events
```

## Integration with UI

### Option 1: Add to Transfer Order Details Window

Add buttons to manually create events:

```csharp
// In TransferOrderDetailWindow.xaml.cs
private async void OnCreateSortEventsClick(object sender, RoutedEventArgs e)
{
    var events = new List<WmsScanEvent>();
    
    // Get selected items from the DataGrid
    foreach (var item in TransferOrderItemsDataGrid.SelectedItems)
    {
        if (item is TransferOrderItem toItem)
        {
            events.Add(EventApiService.CreateSortToBoxEvent(
                "DESKTOP-001", CurrentUser.Id, 
                TransferOrder.AdvanceShippingNotice,
                TransferOrder.Title,
                toItem.ItemCode,
                toItem.AllocatedQty,
                toItem.Store,
                $"BOX-{toItem.Store}-001"  // Generate or select box
            ));
        }
    }
    
    bool success = await EventApiService.SendEventsAsync(events);
    if (success)
    {
        MessageBox.Show("Sort events created successfully!");
        // Refresh Transfer Order to see updated quantities
        await LoadTransferOrderAsync();
    }
}
```

### Option 2: Create Utility Window

Create a dedicated window for event creation:

```csharp
// EventCreationWindow.xaml.cs
public partial class EventCreationWindow : Window
{
    public EventCreationWindow()
    {
        InitializeComponent();
    }
    
    private async void CreateEventsButton_Click(object sender, RoutedEventArgs e)
    {
        // Get values from UI
        string asnNo = AsnTextBox.Text;
        string toNo = ToTextBox.Text;
        string itemCode = ItemCodeTextBox.Text;
        double qty = double.Parse(QtyTextBox.Text);
        string store = StoreTextBox.Text;
        string boxId = BoxIdTextBox.Text;
        
        var events = new List<WmsScanEvent>
        {
            EventApiService.CreateSortToBoxEvent(
                "DESKTOP-001", CurrentUser.Id, asnNo, toNo,
                itemCode, qty, store, boxId
            )
        };
        
        bool success = await EventApiService.SendEventsAsync(events);
        MessageBox.Show(success ? "Event created!" : "Failed to create event");
    }
}
```

## API Endpoint Details

**Endpoint:** `POST /api/events/batch`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "events": [
    {
      "offline_uuid": "unique-uuid",
      "event_type": "SORT_TO_BOX",
      "event_time": "2025-12-27T10:00:00.000Z",
      "device_id": "DESKTOP-001",
      "user_id": "USER-2",
      "advance_shipping_notice": "ASN-0002",
      "transfer_order": "TO-0002",
      "item_code": "SKU-JEANS-021-BLU-32",
      "qty": 200,
      "store": "STORE-001",
      "box_id": "BOX-STORE-001-001",
      "carton_id": "CTN-0101"
    }
  ]
}
```

## Automatic Quantity Updates

When events are created:
1. ✅ Events are saved to `tabWmsScanEvent`
2. ✅ `sorted_qty` is automatically updated from `SORT_TO_BOX` events
3. ✅ `packed_qty` is automatically updated from `PACK_BOX_TO_TC` events
4. ✅ `pending_qty` is automatically calculated as `allocated_qty - packed_qty`

## Testing

After creating events, verify the quantities:

1. **Check Transfer Order Details** - `sorted_qty` and `packed_qty` should be updated
2. **Run Update Script** (if needed):
   ```bash
   cd wms-api
   node update-transfer-order-quantities.js
   ```
3. **Or call API endpoint**:
   ```
   POST /api/transfer-orders/TO-0002/update-quantities
   ```

## Notes

- Each event must have a unique `offline_uuid` (automatically generated by helper methods)
- Events are idempotent - sending the same event twice won't create duplicates
- Box-level `PACK_BOX_TO_TC` events are automatically expanded by the backend
- Transfer Order quantities update automatically when events are created

