using System.Collections.ObjectModel;
using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class DistributionPlanListViewModel : BaseViewModel
{
    public ObservableCollection<DistributionPlan> DistributionPlans { get; } = new();

    public DistributionPlanListViewModel()
    {
        // Flow 1: ASN-0001 -> DP-0001 (allocate T-shirts + gift boxes to stores)
        var dp1Items = new[]
        {
            new DistributionPlanItem
            {
                ItemCode = "SKU-TSHIRT-001-BLK-S",
                ItemName = "Basic T-Shirt Black S",
                StoreWarehouse = "ST-RYD-01",
                QtyAllocated = 300
            },
            new DistributionPlanItem
            {
                ItemCode = "SKU-TSHIRT-001-BLK-S",
                ItemName = "Basic T-Shirt Black S",
                StoreWarehouse = "ST-JED-02",
                QtyAllocated = 300
            },
            new DistributionPlanItem
            {
                ItemCode = "SKU-TSHIRT-001-BLK-M",
                ItemName = "Basic T-Shirt Black M",
                StoreWarehouse = "ST-RYD-01",
                QtyAllocated = 400
            },
            new DistributionPlanItem
            {
                ItemCode = "SKU-GIFT-BOX-01",
                ItemName = "Gift Box Medium",
                StoreWarehouse = "ST-RYD-01",
                QtyAllocated = 200
            }
        };

        DistributionPlans.Add(new DistributionPlan
        {
            DpName = "DP-0001",
            AsnName = "ASN-0001",
            Company = "Printechs",
            SourceWarehouse = "WH-MAIN",
            Status = "In Planning",
            TotalItems = 4,
            TotalQtyAllocated = 300 + 300 + 400 + 200,
            Items = dp1Items
        });

        // Flow 2: ASN-0002 -> DP-0002 (jeans)
        var dp2Items = new[]
        {
            new DistributionPlanItem
            {
                ItemCode = "SKU-JEANS-021-BLU-32",
                ItemName = "Slim Jeans Blue 32",
                StoreWarehouse = "ST-RYD-01",
                QtyAllocated = 200
            },
            new DistributionPlanItem
            {
                ItemCode = "SKU-JEANS-021-BLU-34",
                ItemName = "Slim Jeans Blue 34",
                StoreWarehouse = "ST-JED-02",
                QtyAllocated = 200
            }
        };

        DistributionPlans.Add(new DistributionPlan
        {
            DpName = "DP-0002",
            AsnName = "ASN-0002",
            Company = "Printechs",
            SourceWarehouse = "WH-MAIN",
            Status = "Confirmed",
            TotalItems = 2,
            TotalQtyAllocated = 400,
            Items = dp2Items
        });
    }
}


