using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Wms.Desktop.Models;

public sealed class WmsTransaction
{
    public string Title { get; set; } = string.Empty;
    public string Status { get; set; } = "Draft"; // Draft / Submitted / Completed
    public OperationType OperationType { get; set; } = OperationType.Receiving;
    public DateTime TransactionDate { get; set; } = DateTime.Now;
    public string AssignedTo { get; set; } = string.Empty;
    public string SourceWarehouse { get; set; } = string.Empty;
    public string TargetWarehouse { get; set; } = string.Empty;
    public string? ReferenceDocType { get; set; }
    public string? ReferenceDoc { get; set; }
    public string TransactionStatus { get; set; } = "Draft"; // Draft / In Planning / In Progress / Partial / Completed
    public string? PrimaryAssignee { get; set; }
    public double CompletionProgress { get; set; }
    public bool IsLocked { get; set; }

    public ObservableCollection<WmsTransactionItemDetail> Details { get; set; } = new();
    public ObservableCollection<WmsActiveUser> ConcurrentUsers { get; set; } = new();

    // Operation-specific properties
    public string? ReceivingDock { get; set; }           // Receiving panel
    public bool RequireQC { get; set; }

    public string? PutawayStrategy { get; set; }         // Putaway panel
    public bool SuggestBins { get; set; } = true;

    public string? PickingWave { get; set; }             // Picking panel
    public string? PickRoute { get; set; }

    public string? CycleCountZone { get; set; }          // Cycle Count panel
    public bool FreezeStockDuringCount { get; set; } = true;
}


