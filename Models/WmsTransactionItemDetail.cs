using System;

namespace Wms.Desktop.Models;

public sealed class WmsTransactionItemDetail
{
    public string ItemCode { get; set; } = string.Empty;
    public string ItemName { get; set; } = string.Empty;
    public double Qty { get; set; }
    public string Uom { get; set; } = "Nos";
    public string? ContainerId { get; set; }
    public string? SourceBin { get; set; }
    public string? TargetBin { get; set; }
    public double? ActualQtyCounted { get; set; }
    public double? Discrepancy { get; set; }
    public string AssignmentStatus { get; set; } = "Pending";
    public string? AssignedOperator { get; set; }
    public DateTime? ActualCompletionTime { get; set; }
}


