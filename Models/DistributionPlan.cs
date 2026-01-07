using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class DistributionPlan
{
    public string DpName { get; init; } = string.Empty;
    public string AsnName { get; init; } = string.Empty;
    public string Company { get; init; } = string.Empty;
    public string SourceWarehouse { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft";
    public int TotalItems { get; init; }
    public int TotalQtyAllocated { get; init; }

    public IReadOnlyList<DistributionPlanItem> Items { get; init; } = Array.Empty<DistributionPlanItem>();
}


