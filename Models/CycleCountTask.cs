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
    public string CreatedBy { get; init; } = string.Empty;
    public string? AssignedTo { get; init; }
    public int TotalItems { get; init; }
    public int CountedItems { get; init; }
    public int ItemsWithDiscrepancy { get; init; }
    
    public IReadOnlyList<CycleCountLine> Lines { get; init; } = Array.Empty<CycleCountLine>();
}

public sealed class CycleCountLine
{
    public string ItemCode { get; init; } = string.Empty;
    public string? BinLocation { get; init; }
    public double ExpectedQty { get; init; }
    public double? ActualQty { get; init; }
    public double Discrepancy => (ActualQty ?? 0) - ExpectedQty;
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

