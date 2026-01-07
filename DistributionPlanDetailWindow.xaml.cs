using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class DistributionPlanDetailWindow : Window
{
    public DistributionPlanDetailWindow(DistributionPlan distributionPlan)
    {
        InitializeComponent();
        DataContext = new DistributionPlanDetailViewModel(distributionPlan);
    }
}


