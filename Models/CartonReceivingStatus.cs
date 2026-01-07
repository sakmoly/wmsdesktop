namespace Wms.Desktop.Models;

/// <summary>
/// Helper enum for carton receiving status tracking
/// Used for concurrency control during receiving
/// </summary>
public enum CartonReceivingStatus
{
    Pending,        // Not yet unloaded
    Unloaded,       // Unloaded from truck/pallet
    InReceiving,    // Currently being received (locked by user)
    Received,       // Receiving completed
    Verified,       // Verified/checked
    Closed          // Final status
}

