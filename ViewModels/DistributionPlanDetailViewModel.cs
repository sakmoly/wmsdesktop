using Wms.Desktop.Models;

namespace Wms.Desktop.ViewModels;

public sealed class DistributionPlanDetailViewModel : BaseViewModel
{
    public DistributionPlan DistributionPlan { get; }

    public int TotalItems => DistributionPlan.TotalItems;
    public int TotalQtyAllocated => DistributionPlan.TotalQtyAllocated;

    public DistributionPlanDetailViewModel(DistributionPlan distributionPlan)
    {
        DistributionPlan = distributionPlan;
    }
}


