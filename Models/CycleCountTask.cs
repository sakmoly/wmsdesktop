using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class CycleCountTask
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft";
    public string CountType { get; init; } = "Cycle"; // Full, Cycle, Spot
    public string Warehouse { get; init; } = string.Empty;
    public string? Zone { get; init; }
    public DateTime CountDate { get; init; }
    public TimeSpan? ScheduledStartTime { get; init; }
    public TimeSpan? ScheduledEndTime { get; init; }
    public bool FreezeStock { get; init; }
    public bool IsOpeningStock { get; init; } // true if task contains opening stock items (expected_qty = 0 and actual_qty > 0)
    public string CreatedBy { get; init; } = string.Empty;
    public string? AssignedTo { get; init; }
    public int TotalItems { get; init; }
    public int CountedItems { get; init; }
    public int ItemsWithDiscrepancy { get; init; }
    /// <summary>ERPNext document reference (e.g. Stock Reconciliation name) after push to sync_task_capture_only.</summary>
    public string? ErpReference { get; init; }
    /// <summary>When the task was last successfully pushed to ERPNext.</summary>
    public DateTime? ErpSyncedAt { get; init; }

    public IReadOnlyList<CycleCountLine> Lines { get; init; } = Array.Empty<CycleCountLine>();
}

public sealed class CycleCountLine
{
    public string ItemCode { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public string? CartonId { get; init; } // For carton-level inventory tracking
    public double ExpectedQty { get; init; } // Use 0 for no previous history, > 0 for actual expected quantity
    public double? ActualQty { get; init; }
    // Use discrepancy from database (generated column) - always returns 0 instead of null
    // When actual_qty is NULL (not counted), discrepancy = 0
    // When actual_qty exists, discrepancy = actual_qty - expected_qty
    public double Discrepancy { get; init; } = 0; // Always a number, defaults to 0 (not null)
    public string? CountedBy { get; init; }
    public DateTime? CountedOn { get; init; }
    public string? ReviewedBy { get; init; }
    public DateTime? ReviewedOn { get; init; }
    public bool ApprovalRequired { get; init; }
    public string? ApprovedBy { get; init; }
    public DateTime? ApprovedOn { get; init; }
    public string? DiscrepancyReason { get; init; }
    public string Status { get; init; } = "Pending";
}

