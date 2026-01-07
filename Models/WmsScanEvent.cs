using System;

namespace Wms.Desktop.Models;

/// <summary>
/// Event log for all scan events - append-only for audit trail and offline support
/// Event types: UNLOAD_SCAN, RECEIVE_ITEM_SCAN, SORT_TO_BOX, BOX_CLOSE, BOX_REOPEN, 
/// PACK_BOX_TO_TC, TC_SEAL, TC_DISPATCH, PUTAWAY_CONFIRM, PUTAWAY_TO_RACK, PUTAWAY_DISPATCH
/// </summary>
public sealed class WmsScanEvent
{
    public string OfflineUuid { get; init; } = string.Empty; // Unique ID for offline retry/idempotency
    public string EventType { get; init; } = string.Empty; 
    // UNLOAD_SCAN, RECEIVE_ITEM_SCAN, SORT_TO_BOX, BOX_CLOSE, BOX_REOPEN, 
    // PACK_BOX_TO_TC, TC_SEAL, TC_DISPATCH, PUTAWAY_CONFIRM, PUTAWAY_TO_RACK, PUTAWAY_DISPATCH
    public DateTime EventTime { get; init; }
    public string DeviceId { get; init; } = string.Empty;
    public string UserId { get; init; } = string.Empty;
    public string AdvanceShippingNotice { get; init; } = string.Empty;
    public string? TransferOrder { get; init; }
    public string? InboundSession { get; init; }
    public string? CartonId { get; init; } // Supplier carton ID (CTN-XXXXX)
    public string? ItemCode { get; init; }
    public double? Qty { get; init; } = 1;
    public string? Store { get; init; }
    public string? BoxId { get; init; } // Store Box ID (BOX-STORE-XXXX)
    public string? TcId { get; init; } // Transfer Carton ID (can be same as BoxId)
    public string? Rack { get; init; }
    public string? Bin { get; init; }
    public string? Notes { get; init; }
}

